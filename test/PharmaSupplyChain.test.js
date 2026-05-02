const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PharmaSupplyChain", function () {
  let PharmaSupplyChain;
  let contract;

  let admin;
  let manufacturer;
  let distributor;
  let pharmacy;
  let auditor;
  let outsider;

  const Role = {
    None: 0,
    Manufacturer: 1,
    Distributor: 2,
    Pharmacy: 3,
    Auditor: 4,
  };

  const BatchStatus = {
    Created: 0,
    InTransit: 1,
    Delivered: 2,
    Verified: 3,
  };

  beforeEach(async function () {
    [admin, manufacturer, distributor, pharmacy, auditor, outsider] =
      await ethers.getSigners();

    PharmaSupplyChain = await ethers.getContractFactory("PharmaSupplyChain");
    contract = await PharmaSupplyChain.deploy();
    await contract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should deploy successfully", async function () {
      expect(await contract.getAddress()).to.properAddress;
    });

    it("should set deployer as admin", async function () {
      expect(await contract.admin()).to.equal(admin.address);
    });

    it("should assign deployer the Manufacturer role", async function () {
      expect(await contract.roles(admin.address)).to.equal(Role.Manufacturer);
    });
  });

  describe("Role Management", function () {
    it("should allow admin to assign Manufacturer role", async function () {
      await contract.assignRole(manufacturer.address, Role.Manufacturer);

      expect(await contract.roles(manufacturer.address)).to.equal(
        Role.Manufacturer
      );
    });

    it("should allow admin to assign Distributor role", async function () {
      await contract.assignRole(distributor.address, Role.Distributor);

      expect(await contract.roles(distributor.address)).to.equal(
        Role.Distributor
      );
    });

    it("should allow admin to assign Pharmacy role", async function () {
      await contract.assignRole(pharmacy.address, Role.Pharmacy);

      expect(await contract.roles(pharmacy.address)).to.equal(Role.Pharmacy);
    });

    it("should allow admin to assign Auditor role", async function () {
      await contract.assignRole(auditor.address, Role.Auditor);

      expect(await contract.roles(auditor.address)).to.equal(Role.Auditor);
    });

    it("should emit RoleAssigned event", async function () {
      await expect(contract.assignRole(distributor.address, Role.Distributor))
        .to.emit(contract, "RoleAssigned")
        .withArgs(distributor.address, Role.Distributor);
    });

    it("should reject role assignment from non-admin", async function () {
      await expect(
        contract
          .connect(outsider)
          .assignRole(distributor.address, Role.Distributor)
      ).to.be.revertedWith("Not admin");
    });
  });

  describe("Batch Creation", function () {
    it("should allow manufacturer to create a batch", async function () {
      await contract.createBatch(1, "Drug A");

      const batch = await contract.getBatch(1);

      expect(batch.id).to.equal(1);
      expect(batch.owner).to.equal(admin.address);
      expect(batch.metadata).to.equal("Drug A");
      expect(batch.status).to.equal(BatchStatus.Created);
      expect(batch.exists).to.equal(true);
    });

    it("should emit BatchCreated event", async function () {
      await expect(contract.createBatch(1, "Drug A"))
        .to.emit(contract, "BatchCreated")
        .withArgs(1, admin.address);
    });

    it("should add initial Created history record", async function () {
      await contract.createBatch(1, "Drug A");

      const history = await contract.getBatchHistory(1);

      expect(history.length).to.equal(1);
      expect(history[0].step).to.equal("Created");
      expect(history[0].data).to.equal("Drug A");
      expect(history[0].actor).to.equal(admin.address);
    });

    it("should reject batch creation from non-manufacturer", async function () {
      await expect(
        contract.connect(outsider).createBatch(1, "Drug A")
      ).to.be.revertedWith("Unauthorized role");
    });

    it("should allow another assigned manufacturer to create a batch", async function () {
      await contract.assignRole(manufacturer.address, Role.Manufacturer);

      await contract.connect(manufacturer).createBatch(1, "Drug A");

      const batch = await contract.getBatch(1);

      expect(batch.owner).to.equal(manufacturer.address);
      expect(batch.metadata).to.equal("Drug A");
    });

    it("should reject duplicate batch IDs", async function () {
      await contract.createBatch(1, "Drug A");

      await expect(contract.createBatch(1, "Drug A Duplicate")).to.be.revertedWith(
        "Batch exists"
      );
    });

    it("should allow multiple batches with separate data", async function () {
      await contract.createBatch(1, "Drug A");
      await contract.createBatch(2, "Drug B");

      const batch1 = await contract.getBatch(1);
      const batch2 = await contract.getBatch(2);

      expect(batch1.metadata).to.equal("Drug A");
      expect(batch2.metadata).to.equal("Drug B");
      expect(batch1.id).to.equal(1);
      expect(batch2.id).to.equal(2);
    });
  });

  describe("Batch Retrieval", function () {
    it("should return batch information for an existing batch", async function () {
      await contract.createBatch(1, "Drug A");

      const batch = await contract.getBatch(1);

      expect(batch.id).to.equal(1);
      expect(batch.metadata).to.equal("Drug A");
      expect(batch.owner).to.equal(admin.address);
    });

    it("should reject getBatch for nonexistent batch", async function () {
      await expect(contract.getBatch(999)).to.be.revertedWith(
        "Batch does not exist"
      );
    });

    it("should reject getBatchHistory for nonexistent batch", async function () {
      await expect(contract.getBatchHistory(999)).to.be.revertedWith(
        "Batch does not exist"
      );
    });
  });

  describe("Batch Transfer", function () {
    beforeEach(async function () {
      await contract.assignRole(distributor.address, Role.Distributor);
      await contract.assignRole(pharmacy.address, Role.Pharmacy);
      await contract.createBatch(1, "Drug A");
    });

    it("should allow owner to transfer batch to authorized receiver", async function () {
      await contract.transferBatch(1, distributor.address);

      const batch = await contract.getBatch(1);

      expect(batch.owner).to.equal(distributor.address);
      expect(batch.status).to.equal(BatchStatus.InTransit);
    });

    it("should emit OwnershipTransferred event", async function () {
      await expect(contract.transferBatch(1, distributor.address))
        .to.emit(contract, "OwnershipTransferred")
        .withArgs(1, admin.address, distributor.address);
    });

    it("should add Transferred history record", async function () {
      await contract.transferBatch(1, distributor.address);

      const history = await contract.getBatchHistory(1);

      expect(history.length).to.equal(2);
      expect(history[1].step).to.equal("Transferred");
      expect(history[1].data).to.equal("Ownership transferred");
      expect(history[1].actor).to.equal(admin.address);
    });

    it("should reject transfer from non-owner", async function () {
      await expect(
        contract.connect(outsider).transferBatch(1, distributor.address)
      ).to.be.revertedWith("Not owner");
    });

    it("should reject transfer to address with no role", async function () {
      await expect(contract.transferBatch(1, outsider.address)).to.be.revertedWith(
        "Invalid receiver"
      );
    });

    it("should reject transfer of nonexistent batch", async function () {
      await expect(
        contract.transferBatch(999, distributor.address)
      ).to.be.revertedWith("Batch does not exist");
    });

    it("should allow new owner to transfer batch again", async function () {
      await contract.transferBatch(1, distributor.address);

      await contract.connect(distributor).transferBatch(1, pharmacy.address);

      const batch = await contract.getBatch(1);

      expect(batch.owner).to.equal(pharmacy.address);
    });

    it("should prevent previous owner from acting as owner after transfer", async function () {
      await contract.transferBatch(1, distributor.address);

      await expect(
        contract.transferBatch(1, pharmacy.address)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("Status Updates", function () {
    beforeEach(async function () {
      await contract.assignRole(distributor.address, Role.Distributor);
      await contract.assignRole(pharmacy.address, Role.Pharmacy);
      await contract.assignRole(auditor.address, Role.Auditor);
      await contract.createBatch(1, "Drug A");
      await contract.transferBatch(1, distributor.address);
    });

    it("should allow current owner to update status forward", async function () {
      await contract.connect(distributor).updateStatus(1, BatchStatus.Delivered);

      const batch = await contract.getBatch(1);

      expect(batch.status).to.equal(BatchStatus.Delivered);
    });

    it("should emit StatusUpdated event", async function () {
      await expect(
        contract.connect(distributor).updateStatus(1, BatchStatus.Delivered)
      )
        .to.emit(contract, "StatusUpdated")
        .withArgs(1, BatchStatus.Delivered);
    });

    it("should reject status update from non-owner", async function () {
      await expect(
        contract.connect(outsider).updateStatus(1, BatchStatus.Delivered)
      ).to.be.revertedWith("Not owner");
    });

    it("should reject status update for nonexistent batch", async function () {
      await expect(
        contract.connect(distributor).updateStatus(999, BatchStatus.Delivered)
      ).to.be.revertedWith("Batch does not exist");
    });

    it("should reject status regression", async function () {
      await contract.connect(distributor).updateStatus(1, BatchStatus.Delivered);

      await expect(
        contract.connect(distributor).updateStatus(1, BatchStatus.InTransit)
      ).to.be.revertedWith("Invalid status progression");
    });

    it("should allow status progression to Verified", async function () {
      await contract.connect(distributor).updateStatus(1, BatchStatus.Delivered);
      await contract.connect(distributor).updateStatus(1, BatchStatus.Verified);

      const batch = await contract.getBatch(1);

      expect(batch.status).to.equal(BatchStatus.Verified);
    });
  });

  describe("Process Logging / Provenance History", function () {
    beforeEach(async function () {
      await contract.assignRole(distributor.address, Role.Distributor);
      await contract.createBatch(1, "Drug A");
      await contract.transferBatch(1, distributor.address);
    });

    it("should allow current owner to log a process step", async function () {
      await contract
        .connect(distributor)
        .logProcessStep(1, "Shipped", '{"location":"Warehouse A"}');

      const history = await contract.getBatchHistory(1);

      expect(history.length).to.equal(3);
      expect(history[2].step).to.equal("Shipped");
      expect(history[2].data).to.equal('{"location":"Warehouse A"}');
      expect(history[2].actor).to.equal(distributor.address);
    });

    it("should emit ProcessLogged event", async function () {
      await expect(
        contract
          .connect(distributor)
          .logProcessStep(1, "Shipped", '{"location":"Warehouse A"}')
      )
        .to.emit(contract, "ProcessLogged")
        .withArgs(1, "Shipped", distributor.address);
    });

    it("should reject process logging from non-owner", async function () {
      await expect(
        contract
          .connect(outsider)
          .logProcessStep(1, "Fake Step", '{"bad":true}')
      ).to.be.revertedWith("Not owner");
    });

    it("should reject process logging for nonexistent batch", async function () {
      await expect(
        contract
          .connect(distributor)
          .logProcessStep(999, "Shipped", '{"location":"Warehouse A"}')
      ).to.be.revertedWith("Batch does not exist");
    });

    it("should preserve chronological history order", async function () {
      await contract
        .connect(distributor)
        .logProcessStep(1, "Shipped", '{"location":"Warehouse A"}');

      await contract
        .connect(distributor)
        .logProcessStep(1, "Received", '{"location":"Distribution Center"}');

      const history = await contract.getBatchHistory(1);

      expect(history.length).to.equal(4);
      expect(history[0].step).to.equal("Created");
      expect(history[1].step).to.equal("Transferred");
      expect(history[2].step).to.equal("Shipped");
      expect(history[3].step).to.equal("Received");
    });

    it("should not let logProcessStep change batch status", async function () {
      await contract
        .connect(distributor)
        .logProcessStep(1, "Shipped", '{"location":"Warehouse A"}');

      const batch = await contract.getBatch(1);

      expect(batch.status).to.equal(BatchStatus.InTransit);
    });
  });

  describe("Multi-Batch Behavior", function () {
    beforeEach(async function () {
      await contract.assignRole(distributor.address, Role.Distributor);
      await contract.createBatch(1, "Drug A");
      await contract.createBatch(2, "Drug B");
    });

    it("should keep separate owners for separate batches", async function () {
      await contract.transferBatch(1, distributor.address);

      const batch1 = await contract.getBatch(1);
      const batch2 = await contract.getBatch(2);

      expect(batch1.owner).to.equal(distributor.address);
      expect(batch2.owner).to.equal(admin.address);
    });

    it("should keep separate histories for separate batches", async function () {
      await contract.transferBatch(1, distributor.address);
      await contract
        .connect(distributor)
        .logProcessStep(1, "Shipped", '{"location":"Warehouse A"}');

      const history1 = await contract.getBatchHistory(1);
      const history2 = await contract.getBatchHistory(2);

      expect(history1.length).to.equal(3);
      expect(history2.length).to.equal(1);

      expect(history1[0].step).to.equal("Created");
      expect(history1[1].step).to.equal("Transferred");
      expect(history1[2].step).to.equal("Shipped");

      expect(history2[0].step).to.equal("Created");
      expect(history2[0].data).to.equal("Drug B");
    });
  });

  describe("Full Demo Workflow", function () {
    it("should complete the same workflow used in the demo script", async function () {
      await contract.assignRole(distributor.address, Role.Distributor);

      await contract.createBatch(1, "Drug A");

      await contract.transferBatch(1, distributor.address);

      await contract
        .connect(distributor)
        .logProcessStep(1, "Shipped", '{"location":"Warehouse A"}');

      const batch = await contract.getBatch(1);
      const history = await contract.getBatchHistory(1);

      expect(batch.owner).to.equal(distributor.address);
      expect(batch.status).to.equal(BatchStatus.InTransit);

      expect(history.length).to.equal(3);
      expect(history[0].step).to.equal("Created");
      expect(history[1].step).to.equal("Transferred");
      expect(history[2].step).to.equal("Shipped");

      expect(history[0].actor).to.equal(admin.address);
      expect(history[1].actor).to.equal(admin.address);
      expect(history[2].actor).to.equal(distributor.address);
    });
  });
});