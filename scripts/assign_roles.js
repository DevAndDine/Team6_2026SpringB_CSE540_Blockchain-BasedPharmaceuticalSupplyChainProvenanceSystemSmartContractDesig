#!/bin/bash

echo "Assigning distributor..."
curl -X POST http://localhost:5001/api/assign-role \
  -H "Content-Type: application/json" \
  -d '{"user":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","role":2}'

sleep 2

echo ""
echo "Assigning pharmacy..."
curl -X POST http://localhost:5001/api/assign-role \
  -H "Content-Type: application/json" \
  -d '{"user":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","role":3}'

sleep 2

echo ""
echo "Assigning auditor..."
curl -X POST http://localhost:5001/api/assign-role \
  -H "Content-Type: application/json" \
  -d '{"user":"0x90F79bf6EB2c4f870365E785982E1f101E93b906","role":4}'

echo ""
echo "Done."
