const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function writeJson(dir, filename, data) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2));
}

async function main() {
  const Contract = await hre.ethers.getContractFactory("PharmaSupplyChain");
  const contract = await Contract.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const artifact = await hre.artifacts.readArtifact("PharmaSupplyChain");

  console.log("Contract deployed at:", address);

  await writeJson(
    path.join(__dirname, "..", "backend"),
    "contract-address.json",
    { address }
  );

  await writeJson(
    path.join(__dirname, "..", "backend"),
    "contract-abi.json",
    artifact.abi
  );

  await writeJson(
    path.join(__dirname, "..", "frontend", "src"),
    "contract-address.json",
    { address }
  );

  await writeJson(
    path.join(__dirname, "..", "frontend", "src"),
    "contract-abi.json",
    artifact.abi
  );

  console.log("Updated backend and frontend contract files.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
