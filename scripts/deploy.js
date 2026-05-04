const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  const Contract = await ethers.getContractFactory("PharmaSupplyChain");
  const contract = await Contract.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log("Contract deployed at:", address);
  const frontendDir = path.join(__dirname, "..", "frontend", "src");
  fs.writeFileSync(
    path.join(frontendDir, "contract-address.json"),
    JSON.stringify({ address }, null, 2)
  );

  const artifact = await artifacts.readArtifact("PharmaSupplyChain");

  fs.writeFileSync(
    path.join(frontendDir, "contract-abi.json"),
    JSON.stringify(artifact.abi, null, 2)
  );

  console.log("Frontend files updated.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
