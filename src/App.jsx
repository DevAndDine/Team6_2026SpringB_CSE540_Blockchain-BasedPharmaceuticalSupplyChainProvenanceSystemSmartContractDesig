import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSearch,
  FlaskConical,
  PackagePlus,
  Truck,
  Wallet,
} from "lucide-react";
import { ethers } from "ethers";
import {
  pharmaSupplyChainAbi,
  pharmaSupplyChainBytecode,
} from "./contracts/pharmaSupplyChain.js";

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

const ROLES = {
  Manufacturer: 1,
  Distributor: 2,
  Pharmacy: 3,
  Auditor: 4,
};

const STATUS = ["Created", "InTransit", "Delivered", "Verified"];

const HARDHAT_KEYS = {
  manufacturer:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  distributor:
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  pharmacy:
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  auditor:
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
};

const ROLE_DETAILS = [
  {
    name: "Manufacturer",
    icon: FlaskConical,
    addressKey: "manufacturer",
    contractRole: "Role.Manufacturer",
    functionCalls: [
      "createBatch(batchId, metadata)",
      "logProcessStep(batchId, \"Manufactured\", jsonData)",
      "transferBatch(batchId, distributorAddress)",
    ],
    accessChecks: ["onlyRole(Role.Manufacturer)", "onlyOwner(batchId)"],
    stateWrites: [
      "batches[batchId] = Batch(...)",
      "histories[batchId].push(ProcessRecord(...))",
      "batches[batchId].owner = distributorAddress",
    ],
    events: ["BatchCreated", "ProcessLogged", "OwnershipTransferred"],
  },
  {
    name: "Distributor",
    icon: Truck,
    addressKey: "distributor",
    contractRole: "Role.Distributor",
    functionCalls: [
      "assignRole(distributorAddress, Role.Distributor)",
      "logProcessStep(batchId, \"Shipped\", jsonData)",
      "transferBatch(batchId, pharmacyAddress)",
    ],
    accessChecks: ["roles[receiver] != Role.None", "onlyOwner(batchId)"],
    stateWrites: [
      "roles[distributorAddress] = Role.Distributor",
      "histories[batchId].push(ProcessRecord(...))",
      "batches[batchId].owner = pharmacyAddress",
    ],
    events: ["RoleAssigned", "ProcessLogged", "OwnershipTransferred"],
  },
  {
    name: "Pharmacy",
    icon: PackagePlus,
    addressKey: "pharmacy",
    contractRole: "Role.Pharmacy",
    functionCalls: [
      "assignRole(pharmacyAddress, Role.Pharmacy)",
      "logProcessStep(batchId, \"Received\", jsonData)",
      "updateStatus(batchId, BatchStatus.Delivered)",
    ],
    accessChecks: ["onlyOwner(batchId)", "status must move forward"],
    stateWrites: [
      "roles[pharmacyAddress] = Role.Pharmacy",
      "histories[batchId].push(ProcessRecord(...))",
      "batches[batchId].status = BatchStatus.Delivered",
    ],
    events: ["RoleAssigned", "ProcessLogged", "StatusUpdated"],
  },
  {
    name: "Auditor",
    icon: FileSearch,
    addressKey: "auditor",
    contractRole: "Role.Auditor",
    functionCalls: [
      "assignRole(auditorAddress, Role.Auditor)",
      "getBatch(batchId)",
      "getBatchHistory(batchId)",
    ],
    accessChecks: ["batchExists(batchId)", "view-only read path"],
    stateWrites: [
      "roles[auditorAddress] = Role.Auditor",
      "no batch mutation during audit query",
      "returns ProcessRecord[] from histories[batchId]",
    ],
    events: ["RoleAssigned", "read-only call", "read-only call"],
  },
];

const WORKFLOW_STEPS = [
  {
    id: "setup",
    role: "Setup",
    title: "Initialize local contract",
    detail: "Deploy the contract and authorize Distributor, Pharmacy, and Auditor.",
  },
  {
    id: "manufacturer",
    role: "Manufacturer",
    title: "Create and manufacture batch",
    detail: "Create a product batch, record manufacturing data, and transfer to Distributor.",
  },
  {
    id: "distributor",
    role: "Distributor",
    title: "Ship the batch",
    detail: "Log shipment conditions and transfer ownership to Pharmacy.",
  },
  {
    id: "pharmacy",
    role: "Pharmacy",
    title: "Receive delivery",
    detail: "Record delivery condition and mark the batch as Delivered.",
  },
  {
    id: "auditor",
    role: "Auditor",
    title: "Audit provenance",
    detail: "Read the final batch state and full provenance history.",
  },
];

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatHistory(records) {
  return records.map((record, index) => ({
    id: `${record.actor}-${record.timestamp}-${index}`,
    step: record.step,
    data: record.data,
    timestamp: Number(record.timestamp),
    actor: record.actor,
  }));
}

function makeProvider() {
  return new ethers.JsonRpcProvider(LOCAL_RPC_URL);
}

function makeWallet(name, provider) {
  return new ethers.Wallet(HARDHAT_KEYS[name], provider);
}

function makeManagedWallet(name, provider) {
  return new ethers.NonceManager(makeWallet(name, provider));
}

export default function App() {
  const [page, setPage] = useState("start");
  const [selectedRole, setSelectedRole] = useState("Manufacturer");
  const [account, setAccount] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [batch, setBatch] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [startLogs, setStartLogs] = useState([]);
  const [workflowStep, setWorkflowStep] = useState(0);
  const [workflowSession, setWorkflowSession] = useState(null);
  const workflowSessionRef = useRef(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const selectedRoleDetail = useMemo(
    () => ROLE_DETAILS.find((role) => role.name === selectedRole),
    [selectedRole]
  );

  const workflowComplete = workflowStep >= WORKFLOW_STEPS.length;

  async function connectLocalWallet() {
    setBusy("connect");
    setNotice("");
    try {
      const wallet = makeWallet("manufacturer", makeProvider());
      const connected = await wallet.getAddress();
      const roleLogs = ROLE_DETAILS.map((role) => ({
        title: `${role.name} account ready`,
        detail: new ethers.Wallet(HARDHAT_KEYS[role.addressKey]).address,
      }));
      setAccount(connected);
      setStartLogs([
        { title: "Connected to local Hardhat network", detail: LOCAL_RPC_URL },
        { title: "Local wallet selected", detail: connected },
        ...roleLogs,
      ]);
      setNotice("Wallet connected to Hardhat localhost.");
    } catch (error) {
      setNotice(error.shortMessage || error.message);
    } finally {
      setBusy("");
    }
  }

  function setLogStatus(id, status, detail = "") {
    setLogs((current) => {
      let found = false;
      const next = current.map((log) => {
        if (log.id !== id) return log;
        found = true;
        return { ...log, status, detail };
      });
      return found ? next : [...next, { id, actor: "", action: id, status, detail }];
    });
  }

  function appendLog(log) {
    setLogs((current) => {
      const exists = current.some((item) => item.id === log.id);
      return exists
        ? current.map((item) => (item.id === log.id ? { ...item, ...log } : item))
        : [...current, log];
    });
  }

  async function syncHistory(contract, batchId) {
    const [batchRecord, historyRecords] = await Promise.all([
      contract.getBatch(batchId),
      contract.getBatchHistory(batchId),
    ]);
    setBatch({
      id: batchRecord.id.toString(),
      owner: batchRecord.owner,
      metadata: batchRecord.metadata,
      status: STATUS[Number(batchRecord.status)],
    });
    setHistory(formatHistory(historyRecords));
  }

  async function recordTransaction(id, label, actor, promise) {
    appendLog({ id, actor, action: label, status: "active", detail: "" });
    const tx = await promise;
    const receipt = await tx.wait();
    setLogStatus(id, "done", `${label} confirmed in block ${receipt.blockNumber}`);
    return receipt;
  }

  async function recordRead(id, label, actor, work) {
    appendLog({ id, actor, action: label, status: "active", detail: "" });
    await work();
    setLogStatus(id, "done", `${label} completed`);
  }

  function resetWorkflow() {
    setContractAddress("");
    setBatch(null);
    setHistory([]);
    setLogs([]);
    setWorkflowStep(0);
    setWorkflowSession(null);
    workflowSessionRef.current = null;
    setNotice("");
  }

  async function runCurrentWorkflowStep() {
    const step = WORKFLOW_STEPS[workflowStep];
    if (!step) return;

    setBusy(step.id);
    setNotice("");

    try {
      if (step.id === "setup") {
        await initializeWorkflow();
      }
      if (step.id !== "setup" && !workflowSessionRef.current) {
        throw new Error("Run Setup first to initialize the contract session.");
      }
      if (step.id === "manufacturer") {
        await runManufacturerStep(workflowSessionRef.current);
      }
      if (step.id === "distributor") {
        await runDistributorStep(workflowSessionRef.current);
      }
      if (step.id === "pharmacy") {
        await runPharmacyStep(workflowSessionRef.current);
      }
      if (step.id === "auditor") {
        await runAuditorStep(workflowSessionRef.current);
      }
      setWorkflowStep((current) => Math.min(current + 1, WORKFLOW_STEPS.length));
    } catch (error) {
      setNotice(error.reason || error.shortMessage || error.message);
    } finally {
      setBusy("");
    }
  }

  async function initializeWorkflow() {
    const provider = makeProvider();
    const manufacturer = makeManagedWallet("manufacturer", provider);
    const distributor = makeManagedWallet("distributor", provider);
    const pharmacy = makeManagedWallet("pharmacy", provider);
    const auditor = makeManagedWallet("auditor", provider);
    const distributorAddress = await distributor.getAddress();
    const pharmacyAddress = await pharmacy.getAddress();
    const auditorAddress = await auditor.getAddress();
    const batchId = BigInt(Math.floor(Date.now() / 1000));

    setBatch(null);
    setHistory([]);
    setLogs([]);

    appendLog({
      id: "connect",
      actor: "Local Wallet",
      action: "Connect to Hardhat localhost",
      status: "active",
      detail: "",
    });
    const connected = await manufacturer.getAddress();
    setAccount(connected);
    setLogStatus("connect", "done", `Connected as ${shortAddress(connected)}`);

    appendLog({
      id: "deploy",
      actor: "Manufacturer",
      action: "Deploy PharmaSupplyChain contract",
      status: "active",
      detail: "",
    });
    const factory = new ethers.ContractFactory(
      pharmaSupplyChainAbi,
      pharmaSupplyChainBytecode,
      manufacturer
    );
    const contract = await factory.deploy();
    const deployReceipt = await contract.deploymentTransaction().wait();
    const address = await contract.getAddress();
    setContractAddress(address);
    setLogStatus("deploy", "done", `Contract ${shortAddress(address)} in block ${deployReceipt.blockNumber}`);

    await recordTransaction(
      "role-distributor",
      "Assign Distributor role",
      "Admin",
      contract.assignRole(distributorAddress, ROLES.Distributor)
    );
    await recordTransaction(
      "role-pharmacy",
      "Assign Pharmacy role",
      "Admin",
      contract.assignRole(pharmacyAddress, ROLES.Pharmacy)
    );
    await recordTransaction(
      "role-auditor",
      "Assign Auditor role",
      "Admin",
      contract.assignRole(auditorAddress, ROLES.Auditor)
    );

    const session = {
      contract,
      batchId,
      manufacturer,
      distributor,
      distributorAddress,
      pharmacy,
      pharmacyAddress,
      auditor,
      auditorAddress,
    };
    workflowSessionRef.current = session;
    setWorkflowSession(session);
    setNotice("Contract deployed and roles are ready.");
  }

  async function runManufacturerStep(session) {
    const { contract, batchId, distributorAddress } = session;
    await recordTransaction(
      "create",
      "Manufacturer creates batch",
      "Manufacturer",
      contract.createBatch(batchId, "Insulin Cold Chain Pack")
    );
    await syncHistory(contract, batchId);

    await recordTransaction(
      "manufacture",
      "Manufacturer logs manufacturing data",
      "Manufacturer",
      contract.logProcessStep(
        batchId,
        "Manufactured",
        '{"facility":"Tempe Lab","qa":"passed"}'
      )
    );
    await syncHistory(contract, batchId);

    await recordTransaction(
      "transfer-distributor",
      "Manufacturer transfers batch to Distributor",
      "Manufacturer",
      contract.transferBatch(batchId, distributorAddress)
    );
    await syncHistory(contract, batchId);
  }

  async function runDistributorStep(session) {
    const { contract, batchId, distributor, pharmacyAddress } = session;
    const distributorContract = contract.connect(distributor);
    await recordTransaction(
      "ship",
      "Distributor logs shipment",
      "Distributor",
      distributorContract.logProcessStep(
        batchId,
        "Shipped",
        '{"carrier":"Local Courier","temperature":"4C"}'
      )
    );
    await syncHistory(contract, batchId);

    await recordTransaction(
      "transfer-pharmacy",
      "Distributor transfers batch to Pharmacy",
      "Distributor",
      distributorContract.transferBatch(batchId, pharmacyAddress)
    );
    await syncHistory(contract, batchId);
  }

  async function runPharmacyStep(session) {
    const { contract, batchId, pharmacy } = session;
    const pharmacyContract = contract.connect(pharmacy);
    await recordTransaction(
      "receive",
      "Pharmacy logs receiving condition",
      "Pharmacy",
      pharmacyContract.logProcessStep(
        batchId,
        "Received",
        '{"pharmacy":"Downtown Pharmacy","condition":"sealed"}'
      )
    );
    await syncHistory(contract, batchId);

    await recordTransaction(
      "delivered",
      "Pharmacy marks batch Delivered",
      "Pharmacy",
      pharmacyContract.updateStatus(batchId, 2)
    );
    await syncHistory(contract, batchId);
  }

  async function runAuditorStep(session) {
    const { contract, batchId, auditor } = session;
    const auditorContract = contract.connect(auditor);
    await recordRead("audit", "Auditor queries full provenance history", "Auditor", () =>
      syncHistory(auditorContract, batchId)
    );
    setNotice("Workflow completed successfully.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CSE 540 final demo</p>
          <h1>Pharmaceutical Supply Chain Provenance</h1>
        </div>
      </header>

      <nav className="page-tabs" aria-label="Demo pages">
        <button className={page === "start" ? "active" : ""} onClick={() => setPage("start")}>
          1. Start
        </button>
        <button className={page === "roles" ? "active" : ""} onClick={() => setPage("roles")}>
          2. Roles
        </button>
        <button className={page === "workflow" ? "active" : ""} onClick={() => setPage("workflow")}>
          3. Workflow
        </button>
      </nav>

      <section className="status-band">
        <div>
          <span className="label">Network</span>
          <strong>Hardhat localhost</strong>
        </div>
        {account && (
          <div>
            <span className="label">Connected wallet</span>
            <strong>{shortAddress(account)}</strong>
          </div>
        )}
        <div>
          <span className="label">Contract</span>
          <strong>{contractAddress || "Not deployed yet"}</strong>
        </div>
        <div className={workflowComplete ? "pill success" : "pill"}>
          {workflowComplete ? "Workflow complete" : "Ready for demo"}
        </div>
      </section>

      {notice && <div className="notice">{notice}</div>}

      {page === "start" && (
        <section className="page-section">
          <div className="hero-panel">
            <div>
              <h2>Project is running locally</h2>
              <p>Connect the local wallet to initialize the demo accounts.</p>
            </div>
            <button className="icon-button" onClick={connectLocalWallet}>
              <Wallet size={18} />
              <span>{account ? "Connected" : "Connect Local Wallet"}</span>
            </button>
          </div>

          {account && (
            <div className="connection-grid">
              <article>
                <span className="label">Local chain</span>
                <strong>Hardhat localhost</strong>
              </article>
              <article>
                <span className="label">RPC</span>
                <strong>{LOCAL_RPC_URL}</strong>
              </article>
              <article>
                <span className="label">Connected as</span>
                <strong>{account}</strong>
              </article>
            </div>
          )}

          <div className="start-log">
            <div className="section-heading">
              <h2>Start log</h2>
            </div>
            {startLogs.length === 0 ? (
              <div className="empty-state compact">
                <Database size={20} />
                <span>Connect the local wallet to show initialization logs</span>
              </div>
            ) : (
              startLogs.map((log, index) => (
                <article className="log-row done" key={`${log.title}-${index}`}>
                  <div className="log-index">{index + 1}</div>
                  <div>
                    <h3>{log.title}</h3>
                    <small>{log.detail}</small>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="role-overview">
            <div className="section-heading">
              <h2>Created stakeholder roles</h2>
            </div>
            <div className="role-grid compact">
              {ROLE_DETAILS.map((role) => {
                const address = new ethers.Wallet(HARDHAT_KEYS[role.addressKey]).address;
                const Icon = role.icon;
                return (
                  <article className="role-card" key={role.name}>
                    <Icon size={22} />
                    <h3>{role.name}</h3>
                    <span>{role.contractRole}</span>
                    {account && <small>{address}</small>}
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {page === "roles" && (
        <section className="page-section">
          <div className="section-heading">
            <h2>Select a role</h2>
          </div>

          <div className="role-selector">
            {ROLE_DETAILS.map((role) => (
              <button
                key={role.name}
                className={selectedRole === role.name ? "active" : ""}
                onClick={() => setSelectedRole(role.name)}
              >
                {role.name}
              </button>
            ))}
          </div>

          <div className="selected-role-panel">
            <div className="role-title">
              <selectedRoleDetail.icon size={34} />
              <div>
                <h2>{selectedRoleDetail.name}</h2>
                <span>{selectedRoleDetail.contractRole}</span>
              </div>
            </div>

            <div className="technical-grid">
              <TechnicalList title="Function calls" items={selectedRoleDetail.functionCalls} />
              <TechnicalList title="Access checks" items={selectedRoleDetail.accessChecks} />
              <TechnicalList title="State writes / reads" items={selectedRoleDetail.stateWrites} />
              <TechnicalList title="Events / outputs" items={selectedRoleDetail.events} />
            </div>

            <div className="address-box">
              <span className="label">Demo account</span>
              <strong>
                {new ethers.Wallet(HARDHAT_KEYS[selectedRoleDetail.addressKey]).address}
              </strong>
            </div>
          </div>
        </section>
      )}

      {page === "workflow" && (
        <section className="page-section workflow-page">
          <div className="workflow-header">
            <div>
              <h2>Run a complete stakeholder workflow</h2>
            </div>
            <button
              className="icon-button"
              onClick={resetWorkflow}
              disabled={Boolean(busy)}
            >
              <span>Reset</span>
            </button>
          </div>

          <div className="workflow-layout">
            <div className="step-panel">
              <div className="section-heading">
                <p className="eyebrow">Click one role at a time</p>
                <h2>Workflow steps</h2>
              </div>

              <div className="workflow-step-list">
                {WORKFLOW_STEPS.map((step, index) => {
                  const isDone = index < workflowStep;
                  const isCurrent = index === workflowStep;
                  return (
                    <article
                      className={`workflow-step ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}`}
                      key={step.id}
                    >
                      <div className="log-index">{index + 1}</div>
                      <div>
                        <h3>{step.role}</h3>
                        <p>{step.title}</p>
                        <small>{step.detail}</small>
                      </div>
                      <button
                        onClick={runCurrentWorkflowStep}
                        disabled={!isCurrent || Boolean(busy)}
                      >
                        {isDone ? "Done" : isCurrent ? "Run" : "Locked"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="result-panel">
              <div className="history-list">
                <p className="eyebrow">Complete workflow history</p>
                {history.length === 0 ? (
                  <div className="empty-state compact">
                    <FileSearch size={20} />
                    <span>History will appear as each role completes its transaction</span>
                  </div>
                ) : (
                  history.map((record, index) => (
                    <article className="history-card" key={record.id}>
                      <div className="record-index">{index + 1}</div>
                      <div>
                        <h3>{record.step}</h3>
                        <p>{record.data}</p>
                        <small>
                          {shortAddress(record.actor)} -{" "}
                          {new Date(record.timestamp * 1000).toLocaleString()}
                        </small>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="log-panel">
                <div className="section-heading">
                  <p className="eyebrow">Transaction log</p>
                  <h2>What happened on chain</h2>
                </div>
                {logs.length === 0 ? (
                  <div className="empty-state compact">
                    <Database size={20} />
                    <span>Click the first workflow step to start</span>
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <article className={`log-row ${log.status}`} key={log.id}>
                      <div className="log-index">{index + 1}</div>
                      <div>
                        <h3>{log.action}</h3>
                        <p>{log.actor}</p>
                        {log.detail && <small>{log.detail}</small>}
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="batch-summary">
                <p className="eyebrow">Current batch state</p>
                {batch ? (
                  <div className="summary-grid">
                    <span>ID</span>
                    <strong>{batch.id}</strong>
                    <span>Status</span>
                    <strong>{batch.status}</strong>
                    <span>Owner</span>
                    <strong>{shortAddress(batch.owner)}</strong>
                    <span>Metadata</span>
                    <strong>{batch.metadata}</strong>
                  </div>
                ) : (
                  <div className="empty-state compact">
                    <ClipboardCheck size={20} />
                    <span>No batch result yet</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function TechnicalList({ title, items }) {
  return (
    <div className="technical-card">
      <h3>{title}</h3>
      {items.map((item) => (
        <div className="capability" key={item}>
          <CheckCircle2 size={18} />
          <code>{item}</code>
        </div>
      ))}
    </div>
  );
}
