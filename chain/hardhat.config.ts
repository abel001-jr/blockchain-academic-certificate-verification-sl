import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],

  solidity: {
    profiles: {
      // The optimizer is enabled in every profile on purpose. Unoptimized this
      // contract exceeds the 24576-byte EIP-170 limit, so compiling, testing
      // and deploying under different profiles produces artifacts that disagree
      // and a deploy that fails only at the point of on-chain submission. The
      // registry is called a handful of times per credential and has no hot
      // loops, so favouring code size over runtime gas costs nothing here.
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },

  networks: {
    // In-process simulated network (used by default for tests)
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },

    // Localhost JSON-RPC node (npx hardhat node)
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },

    // Sepolia testnet — set env vars before deploying
    ...(process.env["SEPOLIA_RPC_URL"]
      ? {
          sepolia: {
            type:      "http"     as const,
            chainType: "l1"       as const,
            url:       process.env["SEPOLIA_RPC_URL"]!,
            accounts:  process.env["DEPLOYER_PRIVATE_KEY"]
              ? [process.env["DEPLOYER_PRIVATE_KEY"]]
              : [],
          },
        }
      : {}),
  },
});
