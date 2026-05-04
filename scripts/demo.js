const hre = require("hardhat");

async function main() {
  const [admin, distributor] = await hre.ethers.getSigners();

  console.log("Admin:", admin.address);
  console.log("Distributor:", distributor.address);

  const Contract = await hre.ethers.getContractFactory("PharmaSupplyChain");
  const contract = await Contract.deploy();
  await contract.waitForDeployment();

  console.log("Contract deployed at:", await contract.getAddress());

  // Step 1: Assign role
  await contract.assignRole(distributor.address, 2);
  console.log("✔ Distributor role assigned");

  // Step 2: Create batch
  await contract.createBatch(1, "Drug A");
  console.log("✔ Batch created");

  // Step 3: Transfer ownership
  await contract.transferBatch(1, distributor.address);
  console.log("✔ Ownership transferred");

  // Step 4: Distributor logs process
  await contract.connect(distributor).logProcessStep(
    1,
    "Shipped",
    '{"location":"Warehouse A"}'
  );
  console.log("✔ Process step logged");

  // Step 5: Query history
  const history = await contract.getBatchHistory(1);
  console.log("✔ Batch history:");
  console.log(history);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});