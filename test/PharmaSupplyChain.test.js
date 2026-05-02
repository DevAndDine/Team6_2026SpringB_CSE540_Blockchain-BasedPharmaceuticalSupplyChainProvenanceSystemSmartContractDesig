const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PharmaSupplyChain", function () {
  async function deployFixture() {
    const [admin, distributor, pharmacy, auditor, outsider] =
      await ethers.getSigners();
    const Contract = await ethers.getContractFactory("PharmaSupplyChain");
    const contract = await Contract.deploy();
    await contract.waitForDeployment();

    return {
      contract,
      admin,
      distributor,
      pharmacy,
      auditor,
      outsider,
    };
  }

  async function deployWithRolesFixture() {
    const fixture = await deployFixture();
    const { contract, distributor, pharmacy, auditor } = fixture;

    await contract.assignRole(distributor.address, 2);
    await contract.assignRole(pharmacy.address, 3);
    await contract.assignRole(auditor.address, 4);

    return fixture;
  }

  it("assigns roles and runs the complete stakeholder provenance workflow", async function () {
    const { contract, admin, distributor, pharmacy, auditor } =
      await deployWithRolesFixture();

    await expect(contract.createBatch(1, "Insulin Cold Chain Pack"))
      .to.emit(contract, "BatchCreated")
      .withArgs(1, admin.address);

    await expect(
      contract.logProcessStep(
        1,
        "Manufactured",
        '{"facility":"Tempe Lab","qa":"passed"}'
      )
    )
      .to.emit(contract, "ProcessLogged")
      .withArgs(1, "Manufactured", admin.address);

    await expect(contract.transferBatch(1, distributor.address))
      .to.emit(contract, "OwnershipTransferred")
      .withArgs(1, admin.address, distributor.address);

    await contract
      .connect(distributor)
      .logProcessStep(
        1,
        "Shipped",
        '{"carrier":"Local Courier","temperature":"4C"}'
      );
    await expect(
      contract.connect(distributor).transferBatch(1, pharmacy.address)
    )
      .to.emit(contract, "OwnershipTransferred")
      .withArgs(1, distributor.address, pharmacy.address);

    await contract
      .connect(pharmacy)
      .logProcessStep(
        1,
        "Received",
        '{"pharmacy":"Downtown Pharmacy","condition":"sealed"}'
      );
    await expect(contract.connect(pharmacy).updateStatus(1, 2))
      .to.emit(contract, "StatusUpdated")
      .withArgs(1, 2);

    const batch = await contract.connect(auditor).getBatch(1);
    const history = await contract.connect(auditor).getBatchHistory(1);

    expect(batch.owner).to.equal(pharmacy.address);
    expect(batch.status).to.equal(2);
    expect(history.map((record) => record.step)).to.deep.equal([
      "Created",
      "Manufactured",
      "Transferred",
      "Shipped",
      "Transferred",
      "Received",
    ]);
  });

  it("rejects unauthorized role assignment and manufacturer-only batch creation", async function () {
    const { contract, distributor, outsider } = await deployFixture();

    await expect(
      contract.connect(outsider).assignRole(distributor.address, 2)
    ).to.be.revertedWith("Not admin");

    await expect(
      contract.connect(distributor).createBatch(1, "Drug A")
    ).to.be.revertedWith("Unauthorized role");
  });

  it("rejects duplicate batches, invalid receivers, and non-owner actions", async function () {
    const { contract, distributor, outsider } = await deployWithRolesFixture();

    await contract.createBatch(1, "Drug A");

    await expect(contract.createBatch(1, "Drug A")).to.be.revertedWith(
      "Batch exists"
    );
    await expect(contract.transferBatch(1, outsider.address)).to.be.revertedWith(
      "Invalid receiver"
    );
    await expect(
      contract.connect(distributor).transferBatch(1, distributor.address)
    ).to.be.revertedWith("Not owner");
    await expect(
      contract.connect(distributor).logProcessStep(1, "Shipped", "{}")
    ).to.be.revertedWith("Not owner");
  });

  it("rejects invalid status progression and missing batch queries", async function () {
    const { contract, distributor } = await deployWithRolesFixture();

    await expect(contract.getBatch(404)).to.be.revertedWith(
      "Batch does not exist"
    );

    await contract.createBatch(1, "Drug A");
    await contract.transferBatch(1, distributor.address);

    await expect(
      contract.connect(distributor).updateStatus(1, 0)
    ).to.be.revertedWith("Invalid status progression");
  });
});
