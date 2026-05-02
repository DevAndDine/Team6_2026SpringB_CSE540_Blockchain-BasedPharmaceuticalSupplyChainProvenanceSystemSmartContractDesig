require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PINATA_JWT = process.env.PINATA_JWT;

const addressPath = path.join(__dirname, "contract-address.json");
const abiPath = path.join(__dirname, "contract-abi.json");

if (!PRIVATE_KEY) {
  console.error("Missing PRIVATE_KEY in backend/.env");
  process.exit(1);
}

if (!fs.existsSync(addressPath)) {
  console.error("Missing backend/contract-address.json. Run deploy script first.");
  process.exit(1);
}

if (!fs.existsSync(abiPath)) {
  console.error("Missing backend/contract-abi.json. Run deploy script first.");
  process.exit(1);
}

const { address: CONTRACT_ADDRESS } = JSON.parse(
  fs.readFileSync(addressPath, "utf8")
);

const CONTRACT_ABI = JSON.parse(fs.readFileSync(abiPath, "utf8"));

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

const distributorWallet = new ethers.Wallet(process.env.DISTRIBUTOR_PRIVATE_KEY, provider);
const pharmacyWallet = new ethers.Wallet(process.env.PHARMACY_PRIVATE_KEY, provider);
const auditorWallet = new ethers.Wallet(process.env.AUDITOR_PRIVATE_KEY, provider);

const distributorContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, distributorWallet);
const pharmacyContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, pharmacyWallet);
const auditorContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, auditorWallet);

const STATUS = ["Created", "InTransit", "Delivered", "Verified"];

async function uploadJsonToIPFS(metadata) {
  if (!PINATA_JWT || PINATA_JWT === "PASTE_PINATA_JWT") {
    const fakeHash = `local-demo-${Date.now()}`;
    return {
      ipfsUri: `ipfs://${fakeHash}`,
      cid: fakeHash,
      mode: "local-demo",
    };
  }

  const payload = {
    pinataMetadata: {
      name: `batch-metadata-${Date.now()}.json`,
    },
    pinataContent: metadata,
  };

  const response = await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    payload,
    {
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    ipfsUri: `ipfs://${response.data.IpfsHash}`,
    cid: response.data.IpfsHash,
    mode: "pinata",
  };
}

function formatBatch(batch) {
  return {
    id: batch[0].toString(),
    owner: batch[1],
    metadata: batch[2],
    status: STATUS[Number(batch[3])] || batch[3].toString(),
    exists: batch[4],
  };
}

function formatHistory(history) {
  return history.map((item) => ({
    step: item.step,
    data: item.data,
    timestamp: item.timestamp.toString(),
    date: new Date(Number(item.timestamp) * 1000).toLocaleString(),
    actor: item.actor,
  }));
}

function getErrorMessage(error) {
  return error.reason || error.shortMessage || error.message || "Unknown error";
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Pharma Supply Chain Backend API is running",
    contractAddress: CONTRACT_ADDRESS,
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const blockNumber = await provider.getBlockNumber();

    res.json({
      success: true,
      rpcUrl: RPC_URL,
      blockNumber,
      contractAddress: CONTRACT_ADDRESS,
      walletAddress: wallet.address,
      ipfsMode:
        !PINATA_JWT || PINATA_JWT === "PASTE_PINATA_JWT"
          ? "local-demo"
          : "pinata",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

app.post("/api/upload-metadata", async (req, res) => {
  try {
    const result = await uploadJsonToIPFS(req.body);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || getErrorMessage(error),
    });
  }
});

app.post("/api/assign-role", async (req, res) => {
  try {
    const { user, role } = req.body;

    if (!ethers.isAddress(user)) {
      return res.status(400).json({
        success: false,
        error: "Invalid user address",
      });
    }

    const tx = await contract.assignRole(user, Number(role));
    const receipt = await tx.wait();

    res.json({
      success: true,
      user,
      role: Number(role),
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

app.post("/api/create-batch", async (req, res) => {
  try {
    const { id, metadata } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing batch id",
      });
    }

    if (!metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing metadata",
      });
    }

    const ipfsResult = await uploadJsonToIPFS(metadata);

    const tx = await contract.createBatch(Number(id), ipfsResult.ipfsUri);
    const receipt = await tx.wait();

    const batch = await contract.getBatch(Number(id));
    console.log("RAW BATCH:", batch);

    res.json({
      success: true,
      batch: formatBatch(batch),
      ipfs: ipfsResult,
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

app.post("/api/transfer-batch", async (req, res) => {
  try {
    const { id, newOwner } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing batch id",
      });
    }

    if (!ethers.isAddress(newOwner)) {
      return res.status(400).json({
        success: false,
        error: "Invalid new owner address",
      });
    }

    const tx = await contract.transferBatch(Number(id), newOwner);
    const receipt = await tx.wait();

    const batch = await contract.getBatch(Number(id));

    res.json({
      success: true,
      batch: formatBatch(batch),
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

app.post("/api/log-process-step", async (req, res) => {
  try {
    const { id, step, data } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing batch id",
      });
    }

    if (!step) {
      return res.status(400).json({
        success: false,
        error: "Missing process step",
      });
    }

    const tx = await contract.logProcessStep(
      Number(id),
      step,
      data || "{}"
    );

    const receipt = await tx.wait();
    const history = await contract.getBatchHistory(Number(id));

    res.json({
      success: true,
      history: formatHistory(history),
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

app.post("/api/transfer-batch-as-distributor", async (req, res) => {
  try {
    const { id, newOwner } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: "Missing batch id" });
    }

    if (!ethers.isAddress(newOwner)) {
      return res.status(400).json({ success: false, error: "Invalid new owner address" });
    }

    const tx = await distributorContract.transferBatch(Number(id), newOwner);
    const receipt = await tx.wait();

    const batch = await contract.getBatch(Number(id));

    res.json({
      success: true,
      batch: formatBatch(batch),
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
      signedBy: "Distributor",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

app.post("/api/log-process-step-as-pharmacy", async (req, res) => {
  try {
    const { id, step, data } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: "Missing batch id" });
    }

    if (!step) {
      return res.status(400).json({ success: false, error: "Missing process step" });
    }

    const tx = await pharmacyContract.logProcessStep(
      Number(id),
      step,
      data || "{}"
    );

    const receipt = await tx.wait();
    const history = await contract.getBatchHistory(Number(id));

    res.json({
      success: true,
      history: formatHistory(history),
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
      signedBy: "Pharmacy",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

app.get("/api/batch/:id", async (req, res) => {
  try {
    const batch = await contract.getBatch(Number(req.params.id));

    res.json({
      success: true,
      batch: formatBatch(batch),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

app.get("/api/batch/:id/history", async (req, res) => {
  try {
    const history = await contract.getBatchHistory(Number(req.params.id));

    res.json({
      success: true,
      history: formatHistory(history),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Contract address: ${CONTRACT_ADDRESS}`);
  console.log(
    `IPFS mode: ${
      !PINATA_JWT || PINATA_JWT === "PASTE_PINATA_JWT"
        ? "local-demo"
        : "pinata"
    }`
  );
});
