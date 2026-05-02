import { useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./contract";
import contractAddress from "./contract-address.json";
import contractABI from "./contract-abi.json";
import "./App.css";

const ROLE = {
  Manufacturer: 1,
  Distributor: 2,
  Pharmacy: 3,
  Auditor: 4,
};

const pharmaContract = new ethers.Contract(
  contractAddress.address,
  contractABI,
  signer
);

const STATUS = ["Created", "InTransit", "Delivered", "Verified"];

function App() {
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [message, setMessage] = useState("");

  const [roleAddress, setRoleAddress] = useState("");
  const [role, setRole] = useState(ROLE.Distributor);

  const [batchId, setBatchId] = useState("");
  const [metadata, setMetadata] = useState("");

  const [transferId, setTransferId] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const [stepId, setStepId] = useState("");
  const [step, setStep] = useState("");
  const [data, setData] = useState("");

  const [lookupId, setLookupId] = useState("");
  const [batch, setBatch] = useState(null);
  const [history, setHistory] = useState([]);

  async function connectWallet() {
    try {
      if (!window.ethereum) {
        setMessage("MetaMask not found.");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const pharmaContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
      );

      setAccount(address);
      setContract(pharmaContract);
      setMessage("Wallet connected.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function assignRole() {
    try {
      const tx = await contract.assignRole(roleAddress, role);
      await tx.wait();
      setMessage("Role assigned successfully.");
    } catch (error) {
      setMessage(error.reason || error.message);
    }
  }

  async function createBatch() {
    try {
      const tx = await contract.createBatch(batchId, metadata);
      await tx.wait();
      setMessage("Batch created successfully.");
    } catch (error) {
      setMessage(error.reason || error.message);
    }
  }

  async function transferBatch() {
    try {
      const tx = await contract.transferBatch(transferId, newOwner);
      await tx.wait();
      setMessage("Batch transferred successfully.");
    } catch (error) {
      setMessage(error.reason || error.message);
    }
  }

  async function logProcessStep() {
    try {
      const tx = await contract.logProcessStep(stepId, step, data);
      await tx.wait();
      setMessage("Process step logged successfully.");
    } catch (error) {
      setMessage(error.reason || error.message);
    }
  }

  async function loadBatch() {
    try {
      const result = await contract.getBatch(lookupId);
      const historyResult = await contract.getBatchHistory(lookupId);

      setBatch({
        id: result.idOut.toString(),
        owner: result.owner,
        metadata: result.metadata,
        status: STATUS[Number(result.status)],
        createdAt: new Date(Number(result.createdAt) * 1000).toLocaleString(),
        exists: result.exists,
      });

      setHistory(historyResult);
      setMessage("Batch loaded.");
    } catch (error) {
      setMessage(error.reason || error.message);
    }
  }

  return (
    <div className="app">
      <h1>Pharmaceutical Supply Chain Provenance System</h1>

      <button onClick={connectWallet}>Connect Wallet</button>

      {account && (
        <p>
          <strong>Connected:</strong> {account}
        </p>
      )}

      {message && <p className="message">{message}</p>}

      <section>
        <h2>Assign Role</h2>

        <input
          placeholder="User address"
          value={roleAddress}
          onChange={(e) => setRoleAddress(e.target.value)}
        />

        <select value={role} onChange={(e) => setRole(Number(e.target.value))}>
          <option value={ROLE.Manufacturer}>Manufacturer</option>
          <option value={ROLE.Distributor}>Distributor</option>
          <option value={ROLE.Pharmacy}>Pharmacy</option>
          <option value={ROLE.Auditor}>Auditor</option>
        </select>

        <button onClick={assignRole} disabled={!contract}>
          Assign Role
        </button>
      </section>

      <section>
        <h2>Create Batch</h2>

        <input
          placeholder="Batch ID"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
        />

        <input
          placeholder="Metadata, example: Drug A"
          value={metadata}
          onChange={(e) => setMetadata(e.target.value)}
        />

        <button onClick={createBatch} disabled={!contract}>
          Create Batch
        </button>
      </section>

      <section>
        <h2>Transfer Batch</h2>

        <input
          placeholder="Batch ID"
          value={transferId}
          onChange={(e) => setTransferId(e.target.value)}
        />

        <input
          placeholder="New owner address"
          value={newOwner}
          onChange={(e) => setNewOwner(e.target.value)}
        />

        <button onClick={transferBatch} disabled={!contract}>
          Transfer Batch
        </button>
      </section>

      <section>
        <h2>Log Process Step</h2>

        <input
          placeholder="Batch ID"
          value={stepId}
          onChange={(e) => setStepId(e.target.value)}
        />

        <input
          placeholder="Step, example: Shipped"
          value={step}
          onChange={(e) => setStep(e.target.value)}
        />

        <input
          placeholder='Data, example: {"location":"Warehouse A"}'
          value={data}
          onChange={(e) => setData(e.target.value)}
        />

        <button onClick={logProcessStep} disabled={!contract}>
          Log Step
        </button>
      </section>

      <section>
        <h2>View Batch History</h2>

        <input
          placeholder="Batch ID"
          value={lookupId}
          onChange={(e) => setLookupId(e.target.value)}
        />

        <button onClick={loadBatch} disabled={!contract}>
          Load Batch
        </button>

        {batch && (
          <div className="batch-card">
            <h3>Batch Details</h3>
            <p>
              <strong>ID:</strong> {batch.id}
            </p>
            <p>
              <strong>Owner:</strong> {batch.owner}
            </p>
            <p>
              <strong>Metadata:</strong> {batch.metadata}
            </p>
            <p>
              <strong>Status:</strong> {batch.status}
            </p>
            <p>
              <strong>Created At:</strong> {batch.createdAt}
            </p>
          </div>
        )}

        {history.length > 0 && (
          <div>
            <h3>History</h3>

            {history.map((item, index) => (
              <div className="history-card" key={index}>
                <p>
                  <strong>Step {index + 1}:</strong> {item.step}
                </p>
                <p>
                  <strong>Data:</strong> {item.data}
                </p>
                <p>
                  <strong>Timestamp:</strong>{" "}
                  {new Date(Number(item.timestamp) * 1000).toLocaleString()}
                </p>
                <p>
                  <strong>Actor:</strong> {item.actor}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
