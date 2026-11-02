"""Bloques, Merkle, prueba de trabajo y validador."""

import copy
import hashlib
import random

import pytest

from minichain.block import Block, Transaction, meets_difficulty, mine
from minichain.chain import Blockchain, InvalidBlock
from minichain.merkle import merkle_root
from minichain.validator import validate_chain
from minichain.wallet import Wallet

DIFF = 8


@pytest.fixture
def setup():
    rng = random.Random(42)
    alice, bob, miner = (Wallet.generate(n, rng) for n in ("Alice", "Bob", "Miner"))
    chain = Blockchain.create({alice.address: 100, bob.address: 50}, DIFF, 1000)
    txs = [
        Transaction.create(alice, bob.address, 30, 0, "a"),
        Transaction.create(bob, alice.address, 10, 0, "b"),
        Transaction.create(alice, bob.address, 5, 1, "c"),
    ]
    chain.mine_block(txs, miner.address, 1600)
    chain.mine_block([Transaction.create(bob, alice.address, 1, 1)], miner.address, 2200)
    return chain, alice, bob, miner


def kinds(blocks):
    return {i.kind for i in validate_chain(blocks, DIFF).issues}


def test_merkle_root_by_hand():
    h = lambda b: hashlib.sha256(b).digest()
    a, b, c = "aa" * 32, "bb" * 32, "cc" * 32
    la, lb, lc = (h(b"\x00" + bytes.fromhex(t)) for t in (a, b, c))
    ab = h(b"\x01" + la + lb)
    cc = h(b"\x01" + lc + lc)
    assert merkle_root([a]) == la.hex()
    assert merkle_root([a, b]) == ab.hex()
    assert merkle_root([a, b, c]) == h(b"\x01" + ab + cc).hex()
    assert merkle_root([a, b]) != merkle_root([b, a])


def test_mining_meets_difficulty():
    for d in (0, 4, 10):
        block = Block(1, "00" * 32, 0, d, [])
        attempts = mine(block)
        assert attempts >= 1
        assert meets_difficulty(block.hash(), d)
        assert block.hash().startswith("0" * (d // 4))  # cada 4 bits es un dígito hex


def test_honest_chain_is_valid(setup):
    chain, alice, bob, miner = setup
    report = chain.validate()
    assert report.ok, report.issues
    assert report.signatures_checked == 4
    assert chain.balance(alice.address) == 100 - 30 + 10 - 5 + 1
    assert chain.balance(bob.address) == 50 + 30 - 10 + 5 - 1
    assert chain.balance(miner.address) == 100


def test_detects_modified_amount(setup):
    blocks = copy.deepcopy(setup[0].blocks)
    blocks[1].transactions[1].amount = 99
    assert {"firma", "merkle"} <= kinds(blocks)


def test_detects_broken_link_after_remining(setup):
    blocks = copy.deepcopy(setup[0].blocks)
    blocks[1].transactions[1].amount = 99
    mine(blocks[1])
    found = kinds(blocks)
    assert "enlace" in found and "firma" in found and "merkle" not in found


def test_detects_bad_pow_and_lowered_difficulty(setup):
    blocks = copy.deepcopy(setup[0].blocks)
    blocks[2].nonce += 1
    while meets_difficulty(blocks[2].hash(), DIFF):
        blocks[2].nonce += 1
    assert "pow" in kinds(blocks)

    blocks = copy.deepcopy(setup[0].blocks)
    blocks[2].difficulty = 0
    mine(blocks[2])
    assert "pow" in kinds(blocks)


def test_detects_swapped_signature(setup):
    blocks = copy.deepcopy(setup[0].blocks)
    tx = blocks[1].transactions
    tx[1].signature, tx[3].signature = tx[3].signature, tx[1].signature
    blocks[1].merkle_root = blocks[1].compute_merkle_root()
    assert "firma" in kinds(blocks)


def test_detects_forged_coinbase(setup):
    blocks = copy.deepcopy(setup[0].blocks)
    blocks[1].transactions[0].amount = 10_000
    blocks[1].merkle_root = blocks[1].compute_merkle_root()
    assert "coinbase" in kinds(blocks)


def test_rejects_overspend_replay_and_impersonation(setup):
    chain, alice, bob, miner = setup
    with pytest.raises(InvalidBlock, match="saldo"):
        chain.mine_block([Transaction.create(bob, alice.address, 10**6, 2)], miner.address, 3000)
    old = chain.blocks[1].transactions[1]
    with pytest.raises(InvalidBlock, match="secuencia"):
        chain.mine_block([old], miner.address, 3000)  # replay de una tx ya incluida
    fake = Transaction.create(miner, miner.address, 10, 2)
    fake.sender = alice.pubkey_hex  # dice ser Alice pero lo firmó otra clave
    with pytest.raises(InvalidBlock, match="firma"):
        chain.mine_block([fake], miner.address, 3000)
    assert len(chain.blocks) == 3 and chain.validate().ok


def test_json_roundtrip_of_transactions(setup):
    tx = setup[0].blocks[1].transactions[1]
    assert Transaction.from_dict(tx.to_dict()).txid() == tx.txid()


def test_merkle_proofs_for_every_leaf():
    from minichain.merkle import merkle_proof, verify_merkle_proof
    for size in range(1, 9):
        txids = [hashlib.sha256(bytes([i])).hexdigest() for i in range(size)]
        root = merkle_root(txids)
        for i, t in enumerate(txids):
            proof = merkle_proof(txids, i)
            assert verify_merkle_proof(t, proof, root)
            assert not verify_merkle_proof("ff" * 32, proof, root)


def test_chain_json_roundtrip_revalidates(setup):
    chain = setup[0]
    copy_ = Blockchain.from_json(chain.to_json())
    assert copy_.tip.hash() == chain.tip.hash()
    data = chain.to_dict()
    data["blocks"][1]["transactions"][1]["amount"] = 999
    with pytest.raises(InvalidBlock):
        Blockchain.from_dict(data)


def test_node_mempool_tracks_pending_state(setup):
    from minichain.node import Node, RejectedTransaction
    chain, alice, bob, miner = setup
    node = Node(chain)
    seq = node.next_seq(alice.address)
    node.submit(Transaction.create(alice, bob.address, 40, seq))
    assert node.next_seq(alice.address) == seq + 1
    with pytest.raises(RejectedTransaction):  # el saldo pendiente ya no alcanza
        node.submit(Transaction.create(alice, bob.address, node.available_balance(alice.address) + 1, seq + 1))
    block, _ = node.mine(miner.address, difficulty=DIFF + 2)
    assert block.difficulty == DIFF + 2 and node.mempool == []
    assert chain.validate().ok
    with pytest.raises(ValueError):
        node.mine(miner.address, difficulty=DIFF - 1)
