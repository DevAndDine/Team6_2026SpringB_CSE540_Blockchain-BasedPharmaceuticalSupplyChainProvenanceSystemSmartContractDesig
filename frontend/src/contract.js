export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const CONTRACT_ABI = [
  "function assignRole(address user, uint8 role) public",
  "function createBatch(uint256 id, string memory metadata) public",
  "function transferBatch(uint256 id, address newOwner) public",
  "function logProcessStep(uint256 id, string memory step, string memory data) public",
  "function getBatch(uint256 id) public view returns (uint256 idOut, address owner, string memory metadata, uint8 status, uint256 createdAt, bool exists)",
  "function getBatchHistory(uint256 id) public view returns (tuple(string step,string data,uint256 timestamp,address actor)[] memory)"
];
