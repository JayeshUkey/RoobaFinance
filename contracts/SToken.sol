pragma solidity ^0.8.9;

contract ERC20Basic {
    string public constant name = "Rooba Gold Token";
    string public constant symbol = "RGT";
    uint8 public constant decimals = 1;

    event Approval(
        address indexed tokenOwner,
        address indexed spender,
        uint tokens
    );
    event Transfer(address indexed from, address indexed to, uint tokens);

    mapping(address => uint256) balances;

    mapping(address => mapping(address => uint256)) allowed;

    uint256 totalSupply_;

    using SafeMath for uint256;

    constructor(uint256 total) public {
        totalSupply_ = total;
        balances[msg.sender] = totalSupply_;
    }

    function totalSupply() public view returns (uint256) {
        return totalSupply_;
    }

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

        /*
         * don't forget to emit the transfer event
         * so that external apps can reflect the transfer
         */
        emit Transfer(msg.sender, address(this), _amount);
        
        // e.g. the user is selling 100 tokens, send them 500 wei
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
