import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],

  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
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
