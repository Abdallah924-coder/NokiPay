const RATES = {
    buy: 630,
    sell: 575,
    exchangeFeePercent: 2,
};

const NETWORKS = {
    USDT: ['TRC20', 'BEP20', 'ERC20'],
    BTC: ['BTC'],
    ETH: ['ERC20', 'Arbitrum', 'Optimism'],
    BNB: ['BEP20'],
    SOL: ['SOL'],
    XRP: ['XRP'],
};

const DEPOSIT_ADDRESSES = {
    USDT: {
        TRC20: 'TATtuLm5JBWHZvtACk2AJ2iqPGJRpnZ5Rt',
        BEP20: '0x90439961b090f8b51c28023e30213e318db227f3',
        ERC20: '0x90439961b090f8b51c28023e30213e318db227f3',
    },
    BTC: {
        BTC: '1F7nZDdEw6AcEWRWG18LLDCiHggh3vYFoW',
    },
    ETH: {
        ERC20: '0x90439961b090f8b51c28023e30213e318db227f3',
        Arbitrum: '0x90439961b090f8b51c28023e30213e318db227f3',
        Optimism: '0x90439961b090f8b51c28023e30213e318db227f3',
    },
    BNB: {
        BEP20: '0x90439961b090f8b51c28023e30213e318db227f3',
    },
    SOL: {
        SOL: '4rFEr619w8g96qFBd9DcrUjTDSFXbtCC3iDfANVEYPz5',
    },
    XRP: {
        XRP: 'rJxyARi428MZncrKuWP13gmm4XnjoV9Yxk',
    },
};

function getNetworks(crypto) {
    return NETWORKS[crypto] || [];
}

function getDepositAddress(crypto, network) {
    return DEPOSIT_ADDRESSES[crypto]?.[network] || '';
}

module.exports = {
    RATES,
    NETWORKS,
    DEPOSIT_ADDRESSES,
    getNetworks,
    getDepositAddress,
};
