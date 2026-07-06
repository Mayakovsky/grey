#!/usr/bin/env node
// @grey/ceremony — operator CLI entry. Thin commander wiring over the
// per-command logic in src/commands/*.

import process from 'node:process';
import { Command } from 'commander';
import { addressAction } from './commands/address.ts';
import { genkeyAction } from './commands/genkey.ts';
import { genphraseAction } from './commands/genphrase.ts';
import { linkAgentAction } from './commands/link-agent.ts';
import { mintAction } from './commands/mint.ts';
import { signConsentAction } from './commands/sign-consent.ts';
import { verifyAction } from './commands/verify.ts';

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('grey-ceremony')
    .description("Operator-only CLI for Grey's cold-key custody and identity ceremony")
    .version('0.0.0');

  program
    .command('genphrase')
    .description('Generate a 6-word EFF diceware passphrase')
    .option('--auto', 'non-interactive CSPRNG generation')
    .option('--dice', 'force interactive manual dice entry')
    .action((opts: { auto?: boolean; dice?: boolean }) => genphraseAction(opts));

  program
    .command('genkey')
    .description('Generate a private key and write an encrypted keystore')
    .requiredOption('--out <file>', 'output keystore path')
    .action((opts: { out: string }) => genkeyAction(opts));

  program
    .command('address')
    .description('Decrypt a keystore and print its address')
    .requiredOption('--keyfile <file>', 'keystore path')
    .option('--reveal-private', 'also print the private key (DANGEROUS)')
    .action((opts: { keyfile: string; revealPrivate?: boolean }) => addressAction(opts));

  program
    .command('mint')
    .description('Mint an ERC-8004 identity via register()')
    .requiredOption('--owner-keyfile <file>', 'owner keystore path')
    .requiredOption('--chain-id <n>', 'chain id')
    .option('--registry <addr>', 'registry address override')
    .option('--rpc-url <url>', 'RPC URL (else GREY_CEREMONY_RPC_URL)')
    .action((opts: { ownerKeyfile: string; chainId: string; registry?: string; rpcUrl?: string }) =>
      mintAction(opts),
    );

  program
    .command('sign-consent')
    .description('Sign the EIP-712 AgentWalletSet consent (no broadcast)')
    .requiredOption('--agent-keyfile <file>', 'agent keystore path')
    .requiredOption('--token-id <n>', 'agent token id')
    .requiredOption('--new-wallet <addr>', 'new agent wallet address')
    .requiredOption('--owner <addr>', 'owner address')
    .requiredOption('--deadline <ts>', 'unix deadline')
    .requiredOption('--chain-id <n>', 'chain id')
    .option('--registry <addr>', 'registry address override')
    .action(
      (opts: {
        agentKeyfile: string;
        tokenId: string;
        newWallet: string;
        owner: string;
        deadline: string;
        chainId: string;
        registry?: string;
      }) => signConsentAction(opts),
    );

  program
    .command('link-agent')
    .description('Broadcast setAgentWallet(...) with a signed consent')
    .requiredOption('--owner-keyfile <file>', 'owner keystore path')
    .requiredOption('--token-id <n>', 'agent token id')
    .requiredOption('--new-wallet <addr>', 'new agent wallet address')
    .requiredOption('--deadline <ts>', 'unix deadline')
    .requiredOption('--signature <hex>', '65-byte consent signature')
    .requiredOption('--chain-id <n>', 'chain id')
    .option('--registry <addr>', 'registry address override')
    .option('--rpc-url <url>', 'RPC URL (else GREY_CEREMONY_RPC_URL)')
    .action(
      (opts: {
        ownerKeyfile: string;
        tokenId: string;
        newWallet: string;
        deadline: string;
        signature: string;
        chainId: string;
        registry?: string;
        rpcUrl?: string;
      }) => linkAgentAction(opts),
    );

  program
    .command('verify')
    .description('Read ownerOf + getAgentWallet for a token id')
    .requiredOption('--token-id <n>', 'agent token id')
    .requiredOption('--chain-id <n>', 'chain id')
    .option('--registry <addr>', 'registry address override')
    .option('--rpc-url <url>', 'RPC URL (else GREY_CEREMONY_RPC_URL)')
    .action((opts: { tokenId: string; chainId: string; registry?: string; rpcUrl?: string }) =>
      verifyAction(opts),
    );

  return program;
}

async function main(): Promise<void> {
  await buildProgram().parseAsync(process.argv);
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((err: unknown) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
