const Futures = artifacts.require("Futures.sol");
const Exchange = artifacts.require("Exchange.sol");
const MockToken = artifacts.require("./TetherToken.sol");
const HookSubscriber = artifacts.require("./mocks/HookSubscriberMock.sol");
const SelfDestructor = artifacts.require("./mocks/SelfDestructor.sol");
const utils = require("./helpers/Utils.js");
const web3Utils = require("web3-utils");
const ethutil = require("ethereumjs-util");
const EIP820Registry = require("eip820");
const Web3 = require("web3");
let web3;

const schema_hash =
  "0xb9caf644225739cd2bda9073346357ae4a0c3d71809876978bd81cc702b7fdc7";

contract("Exchange", function (accounts) {
  let Futures, exchange, erc820Registry;
  let feeAccount;

  beforeEach(async () => {
    feeAccount = accounts[4];

    //  erc820Registry = await EIP820Registry.deploy(
    //    new Web3(new Web3.providers.WebsocketProvider("ws://localhost:7545/")),
    //    accounts[0]
    //  );

    web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:7545/"));

    Futures = await Futures.new(erc820Registry.$address);
    exchange = await Exchange.new(
      2500000000000000,
      feeAccount,
      Futures.address
    );
    await Futures.addSpender(exchange.address);
  });

  it("should revert when depositing ether", async () => {
    try {
      await exchange.sendTransaction({ from: accounts[0], value: 1 });
    } catch (error) {
      return utils.ensureException(error);
    }

    assert.fail("depositing ether did not fail");
  });

  describe("cancel", async () => {
    let order, addresses, values;

    beforeEach(async () => {
      order = {
        takerToken: "0xc5427f201fcbc3f7ee175c22e0096078c6f584c4",
        takerTokenAmount: "10",
        makerToken: "0x0000000000000000000000000000000000000000",
        makerTokenAmount: "100",
        expires: Math.floor(Date.now() / 1000 + 5000),
        nonce: 10,
        maker: accounts[0],
        exchange: exchange.address,
      };

      addresses = [order.maker, order.makerToken, order.takerToken];
      values = [
        order.makerTokenAmount,
        order.takerTokenAmount,
        order.expires,
        order.nonce,
      ];
    });

    it("should allow maker to cancel own order", async () => {
      let result = await exchange.cancel(addresses, values);
      assert.equal(result["logs"][0]["event"], "Cancelled");
    });

    it("should prevent maker to cancel other users order", async () => {
      try {
        await exchange.cancel(addresses, values, { from: accounts[1] });
      } catch (error) {
        return utils.ensureException(error);
      }

      assert.fail("cancelling did not fail");
    });
  });

  describe("trade", async () => {
    let order;
    let data;
    let token;

    beforeEach(async () => {
      token = await MockToken.new();

      order = {
        takerToken: token.address,
        takerTokenAmount: "10000000000000000000000",
        makerToken: "0x0000000000000000000000000000000000000000",
        makerTokenAmount: "1000000000000000000",
        expires: Math.floor(Date.now() / 1000 + 5000),
        nonce: 10,
        maker: accounts[0],
        exchange: exchange.address,
      };

      data = await signOrder(order);
    });

    it("should not allow buyer to trade own order", async () => {
      try {
        await exchange.trade(data.addresses, data.values, data.sig, 10, {
          from: accounts[0],
        });
      } catch (error) {
        return utils.ensureException(error);
      }

      assert.fail("trade did not fail");
    });

    it("should not allow maker to trade order without enough balance", async () => {
      await Futures.deposit(0x0, order.makerTokenAmount, {
        from: accounts[0],
        value: order.makerTokenAmount,
      });
      await Futures.approve(exchange.address);

      try {
        await exchange.trade(data.addresses, data.values, data.sig, 10, {
          from: accounts[1],
        });
      } catch (error) {
        return utils.ensureException(error);
      }

      assert.fail("trade did not fail");
    });

    it("should transfer fees correctly on trade", async () => {
      await Futures.deposit(0x0, order.makerTokenAmount, {
        from: accounts[0],
        value: order.makerTokenAmount,
      });
      await Futures.approve(exchange.address);

      await token.mint(accounts[1], order.takerTokenAmount);
      await Futures.deposit(token.address, order.takerTokenAmount, {
        from: accounts[1],
      });
      await Futures.approve(exchange.address, { from: accounts[1] });

      await exchange.trade(
        data.addresses,
        data.values,
        data.sig,
        order.takerTokenAmount,
        { from: accounts[1] }
      );

      assert.equal(
        (await Futures.balanceOf(0x0, feeAccount)).toString(10),
        "2500000000000000"
      );
      assert.equal(
        (await exchange.filled.call(data.hash)).toString(10),
        "10000000000000000000000"
      );
    });

    it("should transfer correctly when trade exceeds available amount on trade", async () => {
      await Futures.deposit(0x0, order.makerTokenAmount, {
        from: accounts[0],
        value: order.makerTokenAmount,
      });
      await Futures.approve(exchange.address);

      await token.mint(accounts[1], order.takerTokenAmount);
      await Futures.deposit(token.address, order.takerTokenAmount, {
        from: accounts[1],
      });
      await Futures.approve(exchange.address, { from: accounts[1] });

      await token.mint(accounts[2], order.takerTokenAmount);
      await Futures.approve(exchange.address, { from: accounts[2] });
      await Futures.deposit(token.address, order.takerTokenAmount, {
        from: accounts[2],
      });

      await exchange.trade(
        data.addresses,
        data.values,
        data.sig,
        order.takerTokenAmount / 2,
        { from: accounts[1] }
      );

      assert.equal(
        (await Futures.balanceOf(0x0, feeAccount)).toString(),
        "1250000000000000"
      );
      assert.equal(
        (await exchange.filled.call(data.hash)).toString(10),
        order.takerTokenAmount / 2
      );

      await exchange.trade(
        data.addresses,
        data.values,
        data.sig,
        order.takerTokenAmount,
        { from: accounts[2] }
      );

      assert.equal(
        (await Futures.balanceOf(0x0, feeAccount)).toString(),
        "2500000000000000"
      );
      assert.equal(
        (await exchange.filled.call(data.hash)).toString(10),
        order.takerTokenAmount
      );
      assert.equal(
        (await Futures.balanceOf(order.makerToken, accounts[2])).toString(),
        order.makerTokenAmount / 2 - 1250000000000000
      );
    });

    it("should transfer correctly when trade exceeds available balance of maker", async () => {
      await Futures.deposit(0x0, order.makerTokenAmount, {
        from: accounts[0],
        value: order.makerTokenAmount / 2,
      });
      await Futures.approve(exchange.address);

      await token.mint(accounts[1], order.takerTokenAmount);
      await Futures.deposit(token.address, order.takerTokenAmount, {
        from: accounts[1],
      });
      await Futures.approve(exchange.address, { from: accounts[1] });

      await token.mint(accounts[2], order.takerTokenAmount);
      await Futures.approve(exchange.address, { from: accounts[2] });
      await Futures.deposit(token.address, order.takerTokenAmount, {
        from: accounts[2],
      });

      await exchange.trade(
        data.addresses,
        data.values,
        data.sig,
        order.takerTokenAmount,
        { from: accounts[1] }
      );

      assert.equal(
        (await Futures.balanceOf(0x0, feeAccount)).toString(),
        "1250000000000000"
      );
      assert.equal(
        (await exchange.filled.call(data.hash)).toString(10),
        order.takerTokenAmount / 2
      );
    });

    it("should trade on chain created order correctly", async () => {
      await Futures.deposit(0x0, order.makerTokenAmount, {
        from: accounts[0],
        value: order.makerTokenAmount,
      });
      await Futures.approve(exchange.address);

      await exchange.order([order.makerToken, order.takerToken], data.values, {
        from: accounts[0],
      });

      await token.mint(accounts[1], order.takerTokenAmount);
      await Futures.deposit(token.address, order.takerTokenAmount, {
        from: accounts[1],
      });
      await Futures.approve(exchange.address, { from: accounts[1] });

      await exchange.trade(
        data.addresses,
        data.values,
        "0x0",
        order.takerTokenAmount,
        { from: accounts[1] }
      );

      assert.equal(
        (await Futures.balanceOf(0x0, feeAccount)).toString(10),
        order.makerTokenAmount * (0.25 / 100)
      );
      assert.equal(
        (await exchange.filled.call(data.hash)).toString(10),
        "10000000000000000000000"
      );
    });
  });

  describe("on chain orders", async () => {
    let order;
    let token;
    let data;

    beforeEach(async () => {
      token = await MockToken.new();

      order = {
        takerToken: token.address,
        takerTokenAmount: "10",
        makerToken: "0x0000000000000000000000000000000000000000",
        makerTokenAmount: "100",
        expires: Math.floor(Date.now() / 1000 + 5000),
        nonce: 10,
        maker: accounts[0],
        exchange: exchange.address,
      };

      data = {
        addresses: [order.makerToken, order.takerToken],
        values: [
          order.makerTokenAmount,
          order.takerTokenAmount,
          order.expires,
          order.nonce,
        ],
      };
    });

    it("should fail to order when Futures has not been approved", async () => {
      try {
        await exchange.order(data.addresses, data.values, {
          from: accounts[0],
        });
      } catch (error) {
        return utils.ensureException(error);
      }

      assert.fail("ordering did not fail");
    });

    it("should fail to order when maker does not have enough balance", async () => {
      await Futures.approve(exchange.address);

      try {
        await exchange.order(data.addresses, data.values, {
          from: accounts[0],
        });
      } catch (error) {
        return utils.ensureException(error);
      }

      assert.fail("ordering did not fail");
    });

    it("should allow ordering on chain", async () => {
      await Futures.approve(exchange.address);
      await Futures.deposit(0x0, order.takerTokenAmount, {
        from: accounts[0],
        value: order.makerTokenAmount,
      });

      let result = await exchange.order(data.addresses, data.values, {
        from: accounts[0],
      });

      let log = result.logs[0].args;
      assert.equal(accounts[0], log.maker);
      assert.equal(order.makerToken, log.makerToken);
      assert.equal(order.takerToken, log.takerToken);
      assert.equal(order.takerTokenAmount, log.takerTokenAmount.toString(10));
      assert.equal(order.makerTokenAmount, log.makerTokenAmount.toString(10));
      assert.equal(order.expires, log.expires);
      assert.equal(order.nonce, log.nonce);

      let hashed = hashOrder(order);
      assert.equal(await exchange.isOrdered(accounts[0], hashed.hash), true);
    });

    it("should not allow duplicate orders", async () => {
      await Futures.approve(exchange.address);
      await Futures.deposit(0x0, order.takerTokenAmount, {
        from: accounts[0],
        value: order.makerTokenAmount,
      });

      await exchange.order(data.addresses, data.values, { from: accounts[0] });

      try {
        await exchange.order(data.addresses, data.values, {
          from: accounts[0],
        });
      } catch (error) {
        return utils.ensureException(error);
      }

      assert.fail("ordering did not fail");
    });
  });

  describe("availableAmount", async () => {
    let order;
    let data;

    beforeEach(async () => {
      order = {
        takerToken: "0xdead",
        takerTokenAmount: "10",
        makerToken: "0x0000000000000000000000000000000000000000",
        makerTokenAmount: "100",
        expires: Math.floor(Date.now() / 1000 + 5000),
        nonce: 10,
        maker: accounts[0],
        exchange: exchange.address,
      };

      data = {
        addresses: [order.maker, order.makerToken, order.takerToken],
        values: [
          order.makerTokenAmount,
          order.takerTokenAmount,
          order.expires,
          order.nonce,
        ],
      };
    });

    it("should return maker balance if it is smaller than order amount", async () => {
      await Futures.deposit(0x0, order.makerTokenAmount / 2, {
        from: accounts[0],
        value: order.makerTokenAmount / 2,
      });
      assert.equal(
        (await exchange.availableAmount(data.addresses, data.values)).toString(
          10
        ),
        order.takerTokenAmount / 2
      );
    });

    it("should return order balance if it is smaller than buyer balance", async () => {
      await Futures.deposit(0x0, order.makerTokenAmount * 2, {
        from: accounts[0],
        value: order.makerTokenAmount * 2,
      });
      assert.equal(
        (await exchange.availableAmount(data.addresses, data.values)).toString(
          10
        ),
        order.takerTokenAmount
      );
    });
  });

  describe("canTrade", async () => {
    let token;
    let order;
    let data;

    beforeEach(async () => {
      token = await MockToken.new();

      order = {
        sellerToken: token.address,
        sellerTokenAmount: "10",
        buyerToken: "0x0000000000000000000000000000000000000000",
        buyerTokenAmount: "100",
        expires: Math.floor(Date.now() / 1000 + 5000),
        nonce: 10,
        maker: accounts[0],
        exchange: exchange.address,
      };

      data = await signOrder(order);
    });

    it("should return false when order is signed by different buyer", async () => {
      data.addresses[0] = accounts[1];
      assert.equal(
        await exchange.canTrade(data.addresses, data.values, data.sig),
        false
      );
    });

    it("should return false when order is cancelled", async () => {
      await exchange.cancel(data.addresses, data.values);
      assert.equal(
        await exchange.canTrade(data.addresses, data.values, data.sig),
        false
      );
    });

    it("should return false when Futures has not been approved", async () => {
      await token.mint(accounts[0], order.takerTokenAmount);
      await Futures.deposit(token.address, order.takerTokenAmount, {
        from: accounts[0],
      });

      assert.equal(
        await exchange.canTrade(data.addresses, data.values, data.sig),
        false
      );
    });

    it("should return false when order has been expired", async () => {
      order = {
        sellerToken: token.address,
        sellerTokenAmount: "10",
        buyerToken: "0x0000000000000000000000000000000000000000",
        buyerTokenAmount: "100",
        expires: Math.floor(Date.now() / 1000 - 5000),
        nonce: 10,
        maker: accounts[0],
        exchange: exchange.address,
      };

      data = await signOrder(order);

      await Futures.deposit(0x0, order.takerTokenAmount, {
        from: accounts[0],
        value: order.makerTokenAmount,
      });
      await Futures.approve(exchange.address);

      assert.equal(
        await exchange.canTrade(data.addresses, data.values, data.sig),
        false
      );
    });

    it("should return false when order has filled", async () => {
      order = {
        sellerToken: token.address,
        sellerTokenAmount: "10",
        buyerToken: "0x0000000000000000000000000000000000000000",
        buyerTokenAmount: "100",
        expires: Math.floor(Date.now() / 1000 + 5000),
        nonce: 10,
        maker: accounts[0],
        exchange: exchange.address,
      };

      data = await signOrder(order);

      await Futures.deposit(0x0, order.makerTokenAmount, {
        from: accounts[0],
        value: order.makerTokenAmount,
      });
      await Futures.approve(exchange.address);

      await token.mint(accounts[1], order.takerTokenAmount);
      await Futures.deposit(token.address, order.takerTokenAmount, {
        from: accounts[1],
      });
      await Futures.approve(exchange.address, { from: accounts[1] });

      await exchange.trade(
        data.addresses,
        data.values,
        data.sig,
        order.takerTokenAmount,
        { from: accounts[1] }
      );
      assert.equal(
        await exchange.canTrade(data.addresses, data.values, data.sig),
        false
      );
    });
  });

  describe("token overflow", async () => {
    it("should allow withdrawing of overflow tokens", async () => {
      let token = await MockToken.new();

      let amount = 10;
      await token.mint(accounts[1], amount);
      await token.transfer(exchange.address, amount, { from: accounts[1] });

      await exchange.withdraw(token.address, amount / 2, { from: accounts[0] });
      assert.equal(
        (await token.balanceOf(accounts[0])).toString(10),
        amount / 2
      );
    });

    it("should allow withdrawing of overflow eth", async () => {
      let selfdestruct = await SelfDestructor.new();

      let amount = 10;
      await selfdestruct.sendTransaction({ from: accounts[0], value: amount });
      await selfdestruct.destroy(exchange.address);

      assert.equal(await web3.eth.getBalance(exchange.address), amount);
      await exchange.withdraw(0x0, amount, { from: accounts[0] });
      assert.equal(
        (await web3.eth.getBalance(exchange.address)).toString(10),
        0
      );
    });
  });

  it("should notify subscriber of trade", async () => {
    let subscriber = await HookSubscriber.new();
    let amount = 10;
    let token = await MockToken.new();

    await token.mint(subscriber.address, amount);

    let order = {
      sellerToken: "0x0000000000000000000000000000000000000000",
      sellerTokenAmount: "10",
      buyerToken: token.address,
      TokenAmount: amount,
      expires: Math.floor(Date.now() / 1000 + 5000),
      nonce: 10,
      exchange: exchange.address,
    };

    let data = {
      addresses: [order.makerToken, order.takerToken],
      values: [
        order.makerTokenAmount,
        order.takerTokenAmount,
        order.expires,
        order.nonce,
      ],
    };

    await subscriber.createOrder(data.addresses, data.values, exchange.address);

    await Futures.deposit(0x0, order.takerTokenAmount, {
      from: accounts[1],
      value: order.takerTokenAmount,
    });
    await Futures.approve(exchange.address, { from: accounts[1] });

    assert.equal(
      0,
      (await subscriber.tokens.call(order.takerToken)).toString(10)
    );

    await exchange.trade(
      [subscriber.address, order.makerToken, order.takerToken],
      data.values,
      "0x0",
      order.takerTokenAmount,
      { from: accounts[1] }
    );

    assert.equal(
      amount,
      (await subscriber.tokens.call(order.takerToken)).toString(10)
    );
  });
});

async function signOrder(order) {
  let hashed = hashOrder(order);

  let sig = (await web3.eth.sign(hashed.hash, order.maker)).slice(2);

  let r = ethutil.toBuffer("0x" + sig.substring(0, 64));
  let s = ethutil.toBuffer("0x" + sig.substring(64, 128));
  let v = ethutil.toBuffer(parseInt(sig.substring(128, 130), 16) + 27);
  let mode = ethutil.toBuffer(1);

  let signature = "0x" + Buffer.concat([mode, v, r, s]).toString("hex");

  return {
    addresses: hashed.addresses,
    values: hashed.values,
    sig: signature,
    hash: hashed.hash,
  };
}

function hashOrder(order) {
  let addresses = [order.maker, order.makerToken, order.takerToken];
  let values = [
    order.makerTokenAmount,
    order.takerTokenAmount,
    order.expires,
    order.nonce,
  ];

  let valuesHash = web3Utils.soliditySha3.apply(
    null,
    Object.entries(order).map(function (x) {
      return x[1];
    })
  );

  let hash = web3Utils.soliditySha3(schema_hash, valuesHash);

  return { hash: hash, addresses: addresses, values: values };
}
