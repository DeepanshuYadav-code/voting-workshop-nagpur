import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Voting } from "../target/types/voting";

const IDL = require("../target/idl/voting.json");
const PROGRAM_ID = new PublicKey(IDL.address);

describe("Voting", () => {
  let context;
  let provider;
  let votingProgram: anchor.Program<Voting>;

  beforeAll(async () => {
    context = await startAnchor('', [{ name: "voting", programId: PROGRAM_ID }], []);
    provider = new BankrunProvider(context);
    votingProgram = new anchor.Program<Voting>(
      IDL,
      provider,
    );
  });

  it("initializes a poll with a valid end time", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const futureTime = currentTime + 3600;
    await votingProgram.methods.initializePoll(
        new anchor.BN(1),
        "What is your favorite color?",
        new anchor.BN(currentTime),
        new anchor.BN(futureTime)
      ).rpc();

    const [pollAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
      votingProgram.programId,
    );

    const poll = await votingProgram.account.poll.fetch(pollAddress);
    
    expect(poll.pollTotalVotes.toNumber()).toBe(0);

    console.log(poll);

    expect(poll.pollId.toNumber()).toBe(1);
    expect(poll.description).toBe("What is your favorite color?");
    expect(poll.pollStart.toNumber()).toBe(currentTime);
    expect(poll.pollEnd.toNumber()).toBe(futureTime);
  });

  it("fails to initialize poll with past end time", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const pastTime = currentTime - 3600; // 1 hour in the past

    try {
      await votingProgram.methods
        .initializePoll(
          new anchor.BN(2),
          "Past poll",
          new anchor.BN(currentTime),
          new anchor.BN(pastTime)
        )
        .rpc();
      // the test should fail here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.toString()).toContain("Poll end time must be in the future");
    }
  });

  it("fails to initialize poll with invalid timestamp", async () => {
    try {
      await votingProgram.methods
        .initializePoll(
          new anchor.BN(3),
          "Invalid timestamp poll",
          new anchor.BN(100),
          new anchor.BN(0) // Invalid timestamp
        ).rpc();
      // the test should fail here too
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.toString()).toContain("Invalid Unix timestamp");
    }
  });

  //since the poll initialization is expected to fail, so no need to fetch the poll

  it("initializes candidates", async () => {
    await votingProgram.methods.initializeCandidate(
      "Pink",
      new anchor.BN(1),
    ).rpc();
    await votingProgram.methods.initializeCandidate(
      "Blue",
      new anchor.BN(1),
    ).rpc();
    const [pollAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
      votingProgram.programId
    );
    const poll = await votingProgram.account.poll.fetch(pollAddress);
    expect(poll.candidateAmount.toNumber()).toBe(2);

    const [pinkAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Pink")],
      votingProgram.programId,
    );
    const pinkCandidate = await votingProgram.account.candidate.fetch(pinkAddress);
    console.log(pinkCandidate);
    expect(pinkCandidate.candidateVotes.toNumber()).toBe(0);
    expect(pinkCandidate.candidateName).toBe("Pink");

    const [blueAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Blue")],
      votingProgram.programId,
    );
    const blueCandidate = await votingProgram.account.candidate.fetch(blueAddress);
    console.log(blueCandidate);
    expect(blueCandidate.candidateVotes.toNumber()).toBe(0);
    expect(blueCandidate.candidateName).toBe("Blue");
  });

  it("vote candidates", async () => {
    try {
      await votingProgram.methods.vote("Pink", new anchor.BN(1)).rpc();
      await votingProgram.methods.vote("Blue", new anchor.BN(1)).rpc();
      await expect(
        votingProgram.methods.vote("Pink", new anchor.BN(1)).rpc()
      ).rejects.toThrow("already voted");
    } catch (e) {
      console.log(e);
    }
    await votingProgram.methods.vote(
      "Pink",
      new anchor.BN(1),
    ).rpc();

    const [pinkAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Pink")],
      votingProgram.programId,
    );
    const pinkCandidate = await votingProgram.account.candidate.fetch(pinkAddress);
    console.log(pinkCandidate);
    expect(pinkCandidate.candidateVotes.toNumber()).toBe(2);
    expect(pinkCandidate.candidateName).toBe("Pink");

    const [blueAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Blue")],
      votingProgram.programId,
    );
    const blueCandidate = await votingProgram.account.candidate.fetch(blueAddress);
    console.log(blueCandidate);
    expect(blueCandidate.candidateVotes.toNumber()).toBe(1);
    expect(blueCandidate.candidateName).toBe("Blue");



    const [pollAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
      votingProgram.programId,
    );
    
    const poll = await votingProgram.account.poll.fetch(pollAddress);
    expect(poll.pollTotalVotes.toNumber()).toBe(3);
  });



  it("counts poll votes", async () => {
    // Get poll account
    const [pollAddress] = PublicKey.findProgramAddressSync(
        [new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
        votingProgram.programId,
    );
    
    // Call count_poll_votes instruction
    await votingProgram.methods.countPollVotes(
        new anchor.BN(1)
    ).rpc();
    
    // Verify the counts
    const poll = await votingProgram.account.poll.fetch(pollAddress);
    expect(poll.pollTotalVotes.toNumber()).toBe(3);
    expect(poll.candidateAmount.toNumber()).toBe(2);
    
    // Verify individual candidate votes
    const [pinkAddress] = PublicKey.findProgramAddressSync(
        [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Pink")],
        votingProgram.programId,
    );
    const pinkCandidate = await votingProgram.account.candidate.fetch(pinkAddress);
    
    const [blueAddress] = PublicKey.findProgramAddressSync(
        [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Blue")],
        votingProgram.programId,
    );
    const blueCandidate = await votingProgram.account.candidate.fetch(blueAddress);
    
    expect(pinkCandidate.candidateVotes.toNumber()).toBe(2);
    expect(blueCandidate.candidateVotes.toNumber()).toBe(1);
});
});