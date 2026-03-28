# Blockchain-Based Pharmaceutical Supply Chain Provenance System

## Project Description
This project implements a simplified blockchain-based pharmaceutical supply chain provenance system.  
It tracks drug batches as they move through key stakeholders in the supply chain:

- Manufacturer
- Distributor
- Pharmacy
- Auditor

The goal is to improve transparency, traceability, and trust by recording product lifecycle events on a blockchain.  
Each batch has a unique identifier, current owner, status, and immutable provenance history.

## Project Context
This project is developed as part of an academic team assignment for a blockchain engineering course.  
The objective is to design and implement a simplified pharmaceutical supply chain provenance system using blockchain concepts.

The implementation focuses on demonstrating core ideas such as immutability, traceability, and decentralized trust in a controlled, educational setting.

## Features
- Create pharmaceutical product batches
- Transfer ownership between stakeholders
- Log process steps such as manufacturing, shipping, and receiving
- Retrieve provenance history for verification
- Enforce role-based access control

## Example Workflow
1. Admin assigns roles (Manufacturer, Distributor, Pharmacy, Auditor)
2. Manufacturer creates a new batch
3. Manufacturer logs "Manufactured" step
4. Ownership is transferred to Distributor
5. Distributor logs "Shipped" step
6. Ownership is transferred to Pharmacy
7. Pharmacy logs "Received" step
8. Auditor retrieves batch history using `getBatchLogs()`

## Tech Stack
- Solidity
- Hardhat
- Ethers.js
- Ethereum local Hardhat network

## Dependencies
Install the following in your project:

```bash
npm init -y
npm install --save-dev hardhat
npm install --save-dev @nomicfoundation/hardhat-toolbox
npm install ethers
```

## Usage

### 1. Start Local Blockchain
Run a local Ethereum network using Hardhat:

```bash
npx hardhat node
```

### 2. Compile Smart Contract
```bash
npx hardhat compile
```

### 3. Deploy the contract
```bash
npx hardhat run scripts/deploy.js --network localhost
```

### 4. Start Hardhat console
```bash
npx hardhat console --network localhost
```

### 5. Interact with the Contract
You can interact with the deployed contract using:
- Hardhat console
- Test scripts
- Optional frontend (if implemented)

## Contributors
This project was developed as a team effort by:

- Kannan Meiappan
- Lingya Chen
- Priyananda Vangala
- Yunlin Xie

Each member contributed collaboratively to different aspects of the project including smart contract development, frontend implementation, testing, and documentation.

## Disclaimer

This project is a simplified academic prototype developed for educational purposes.

It is designed to demonstrate core blockchain concepts such as:
- immutability
- provenance tracking
- decentralized trust

This system does NOT:
- integrate with real-world pharmaceutical supply chain systems
- comply with regulatory standards such as FDA DSCSA
- handle production-scale data or security requirements

The implementation is not intended for real-world deployment and should not be used in production environments.
