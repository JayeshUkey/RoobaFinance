// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;



contract Trading is GoldToken, TetherToken{

    function balanceOf(address tokenOwner) public view returns (uint) {
        return balances[tokenOwner];
    }

    function transfer(address receiver, uint numTokens) public returns (bool) {
        require(numTokens <= balances[msg.sender]);
        balances[msg.sender] = balances[msg.sender].sub(numTokens);
        balances[receiver] = balances[receiver].add(numTokens);
        emit Transfer(msg.sender, receiver, numTokens);
        return true;
    }

    function approve(address delegate, uint numTokens) public returns (bool) {
        allowed[msg.sender][delegate] = numTokens;
        emit Approval(msg.sender, delegate, numTokens);
        return true;
    }

    function allowance(address owner, address delegate)
        public
        view
        returns (uint)
    {
        return allowed[owner][delegate];
    }


        //Trading functionality
    uint256 public constant tokenPrice = 5; // 1 token for 5 tether
    
    function buy(uint256 _amount) external payable {
        // e.g. the buyer wants 100 tokens, needs to send 500 tether
        require(msg.value == _amount * tokenPrice, 'Need to send exact amount of wei');
        
        /*
         * sends the requested amount of tokens
         * from this contract address
         * to the buyer
         */
        transfer(msg.sender, _amount);
    }
    
    function sell(uint256 _amount) external {
        // decrement the token balance of the seller
        balances[msg.sender] -= _amount;
        increment the token balance of this contract
        balances[address(this)] += _amount;

        emit Transfer(msg.sender, address(this), _amount);
        
        // e.g. the user is selling 100 tokens, send them 500 tether
        payable(msg.sender).transfer(amount * tokenPrice);
    }

    function transferFrom(
        address owner,
        address buyer,
        uint numTokens
    ) public returns (bool) {
        require(numTokens <= balances[owner]);
        require(numTokens <= allowed[owner][msg.sender]);

        balances[owner] = balances[owner].sub(numTokens);
        allowed[owner][msg.sender] = allowed[owner][msg.sender].sub(numTokens);
        balances[buyer] = balances[buyer].add(numTokens);
        emit Transfer(owner, buyer, numTokens);
        return true;
    }
}
