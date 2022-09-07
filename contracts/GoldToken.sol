pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract GoldToken is ERC20 {
    
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

    constructor(uint256 total) public ("RoobaGold", "RGLD"){
        _mint(msg.sender, initialSupply)
        totalSupply_ = total;
        balances[msg.sender] = totalSupply_;
    }

    function totalSupply() public view returns (uint256) {
        return totalSupply_;
    }

   
}

