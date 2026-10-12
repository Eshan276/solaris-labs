/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/solaris_v2.json`.
 */
export type SolarisV2 = {
  "address": "CT5Mi74a94AF6W4H2dfUnSC5F8P2gxK3J5jrCNGFMcZa",
  "metadata": {
    "name": "solarisV2",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solaris Labs v2: invest anytime, per-share revenue accounting, on-chain settlement proofs"
  },
  "instructions": [
    {
      "name": "buyListing",
      "discriminator": [
        115,
        149,
        42,
        108,
        44,
        49,
        140,
        153
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "seller",
          "writable": true
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.projectId",
                "account": "project"
              }
            ]
          },
          "relations": [
            "listing"
          ]
        },
        {
          "name": "revenueState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "seller"
              }
            ]
          }
        },
        {
          "name": "sellerPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "seller"
              }
            ]
          }
        },
        {
          "name": "buyerPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "stablecoinMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "shareMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "buyerStablecoinAccount",
          "writable": true
        },
        {
          "name": "sellerStablecoinAccount",
          "writable": true
        },
        {
          "name": "buyerShareAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "maxPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelListing",
      "discriminator": [
        41,
        183,
        50,
        232,
        230,
        233,
        157,
        70
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true,
          "relations": [
            "listing"
          ]
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.projectId",
                "account": "project"
              }
            ]
          },
          "relations": [
            "listing"
          ]
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "seller"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "sellerShareAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "claimRevenue",
      "discriminator": [
        4,
        22,
        151,
        70,
        183,
        79,
        73,
        189
      ],
      "accounts": [
        {
          "name": "investor",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.projectId",
                "account": "project"
              }
            ]
          }
        },
        {
          "name": "revenueState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "investor"
              }
            ]
          }
        },
        {
          "name": "stablecoinMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "revenueVault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "investorStablecoinAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "fundRevenue",
      "discriminator": [
        159,
        48,
        151,
        57,
        245,
        127,
        57,
        111
      ],
      "accounts": [
        {
          "name": "operator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.projectId",
                "account": "project"
              }
            ]
          }
        },
        {
          "name": "revenueState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "settlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "project.settlementCount",
                "account": "project"
              }
            ]
          }
        },
        {
          "name": "stablecoinMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "revenueVault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "operatorStablecoinAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "settlementArgs"
            }
          }
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stablecoinMint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "revenueOperator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initializeProject",
      "discriminator": [
        69,
        126,
        215,
        37,
        20,
        60,
        73,
        235
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.projectCount",
                "account": "protocolConfig"
              }
            ]
          }
        },
        {
          "name": "revenueState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "stablecoinMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "shareMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "investmentVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  101,
                  115,
                  116,
                  109,
                  101,
                  110,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "revenueVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "sharePrice",
          "type": "u64"
        },
        {
          "name": "maxShares",
          "type": "u64"
        },
        {
          "name": "meter",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "listShares",
      "discriminator": [
        156,
        51,
        24,
        84,
        242,
        112,
        152,
        53
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.projectId",
                "account": "project"
              }
            ]
          }
        },
        {
          "name": "position",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "seller"
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "seller"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "sellerShareAccount",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "listing"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "price",
          "type": "u64"
        }
      ]
    },
    {
      "name": "purchaseShares",
      "discriminator": [
        171,
        132,
        3,
        224,
        99,
        69,
        214,
        250
      ],
      "accounts": [
        {
          "name": "investor",
          "writable": true,
          "signer": true
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.projectId",
                "account": "project"
              }
            ]
          }
        },
        {
          "name": "revenueState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "investor"
              }
            ]
          }
        },
        {
          "name": "stablecoinMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "shareMint",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "investmentVault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "investorStablecoinAccount",
          "writable": true
        },
        {
          "name": "investorShareAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "investor"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setMeter",
      "discriminator": [
        174,
        131,
        160,
        94,
        106,
        146,
        148,
        188
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.projectId",
                "account": "project"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "meter",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setProjectActive",
      "discriminator": [
        28,
        181,
        63,
        93,
        252,
        195,
        93,
        206
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.projectId",
                "account": "project"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "active",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setRevenueOperator",
      "discriminator": [
        153,
        190,
        206,
        106,
        39,
        198,
        12,
        53
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "revenueOperator",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "investorPosition",
      "discriminator": [
        145,
        143,
        236,
        150,
        229,
        40,
        195,
        88
      ]
    },
    {
      "name": "listing",
      "discriminator": [
        218,
        32,
        50,
        73,
        43,
        134,
        26,
        58
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "project",
      "discriminator": [
        205,
        168,
        189,
        202,
        181,
        247,
        142,
        19
      ]
    },
    {
      "name": "protocolConfig",
      "discriminator": [
        207,
        91,
        250,
        28,
        152,
        179,
        215,
        209
      ]
    },
    {
      "name": "revenueState",
      "discriminator": [
        179,
        7,
        173,
        234,
        30,
        131,
        186,
        184
      ]
    },
    {
      "name": "settlement",
      "discriminator": [
        55,
        11,
        219,
        33,
        36,
        136,
        40,
        182
      ]
    }
  ],
  "events": [
    {
      "name": "tradeEvent",
      "discriminator": [
        189,
        219,
        127,
        211,
        78,
        230,
        97,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorizedAdmin",
      "msg": "Signer is not the protocol admin"
    },
    {
      "code": 6001,
      "name": "unauthorizedOperator",
      "msg": "Signer is not the authorized revenue operator"
    },
    {
      "code": 6002,
      "name": "projectInactive",
      "msg": "Project is not active"
    },
    {
      "code": 6003,
      "name": "invalidShareAmount",
      "msg": "Share amount must be greater than zero"
    },
    {
      "code": 6004,
      "name": "exceedsMaxShares",
      "msg": "Purchase would exceed the project's maximum shares"
    },
    {
      "code": 6005,
      "name": "invalidProjectParams",
      "msg": "Share price and max shares must be greater than zero"
    },
    {
      "code": 6006,
      "name": "invalidRevenueAmount",
      "msg": "Revenue amount must be greater than zero"
    },
    {
      "code": 6007,
      "name": "noShareholders",
      "msg": "Project has no shareholders to distribute revenue to"
    },
    {
      "code": 6008,
      "name": "nothingToClaim",
      "msg": "No claimable revenue"
    },
    {
      "code": 6009,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6010,
      "name": "invalidPeriod",
      "msg": "Settlement period is empty or overlaps an already settled period"
    },
    {
      "code": 6011,
      "name": "noReadings",
      "msg": "Settlement must include at least one meter reading"
    },
    {
      "code": 6012,
      "name": "invalidListing",
      "msg": "Shares and price must be greater than zero"
    },
    {
      "code": 6013,
      "name": "insufficientShares",
      "msg": "Not enough shares in your position"
    },
    {
      "code": 6014,
      "name": "ownListing",
      "msg": "You can't buy your own listing"
    },
    {
      "code": 6015,
      "name": "listingTooSmall",
      "msg": "The listing doesn't have that many shares left"
    },
    {
      "code": 6016,
      "name": "priceAboveMax",
      "msg": "The listing price is above your maximum price"
    }
  ],
  "types": [
    {
      "name": "investorPosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "investor",
            "type": "pubkey"
          },
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "docs": [
              "Revenue rights are tracked here, not by share-token balance."
            ],
            "type": "u64"
          },
          {
            "name": "revenueClaimed",
            "docs": [
              "Lifetime revenue paid out to this investor."
            ],
            "type": "u64"
          },
          {
            "name": "rewardDebt",
            "docs": [
              "`shares × acc_revenue_per_share` at the last checkpoint, so earlier revenue isn't counted again."
            ],
            "type": "u128"
          },
          {
            "name": "pending",
            "docs": [
              "Revenue earned before the last share purchase and not yet claimed."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "listing",
      "docs": [
        "Shares a holder has offered for sale at a fixed price. The share tokens sit in an escrow",
        "account owned by this listing; the position's revenue rights stay with the seller until a sale.",
        "One listing per seller per project: change the price by cancelling and listing again."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Shares still for sale."
            ],
            "type": "u64"
          },
          {
            "name": "price",
            "docs": [
              "Stablecoin base units per share."
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "market",
      "docs": [
        "Running secondary-market figures for a project."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "lastPrice",
            "type": "u64"
          },
          {
            "name": "tradeCount",
            "type": "u64"
          },
          {
            "name": "volumeShares",
            "type": "u64"
          },
          {
            "name": "volumeStablecoin",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "project",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "stablecoinMint",
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "investmentVault",
            "type": "pubkey"
          },
          {
            "name": "revenueVault",
            "type": "pubkey"
          },
          {
            "name": "meter",
            "docs": [
              "Ed25519 key of the project's meter. Readings it signs are the evidence behind each settlement."
            ],
            "type": "pubkey"
          },
          {
            "name": "sharePrice",
            "docs": [
              "Stablecoin base units per whole share."
            ],
            "type": "u64"
          },
          {
            "name": "maxShares",
            "type": "u64"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "settlementCount",
            "docs": [
              "Number of settlements recorded; also the index of the next one."
            ],
            "type": "u64"
          },
          {
            "name": "lastPeriodEnd",
            "docs": [
              "End of the last settled period (unix seconds). Periods must not overlap."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "protocolConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "stablecoinMint",
            "type": "pubkey"
          },
          {
            "name": "revenueOperator",
            "type": "pubkey"
          },
          {
            "name": "projectCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "revenueState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "totalFunded",
            "docs": [
              "Cumulative revenue ever deposited."
            ],
            "type": "u64"
          },
          {
            "name": "totalClaimed",
            "type": "u64"
          },
          {
            "name": "accRevenuePerShare",
            "docs": [
              "Revenue per share ever deposited, scaled by `ACC_PRECISION`."
            ],
            "type": "u128"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "settlement",
      "docs": [
        "One revenue settlement and the evidence behind it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "amount",
            "docs": [
              "Stablecoin base units deposited."
            ],
            "type": "u64"
          },
          {
            "name": "energyWh",
            "docs": [
              "Energy the settlement pays for, in watt-hours at project scale."
            ],
            "type": "u64"
          },
          {
            "name": "proofHash",
            "docs": [
              "SHA-256 of the published, meter-signed readings file for this period."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "readingsCount",
            "type": "u32"
          },
          {
            "name": "periodStart",
            "type": "i64"
          },
          {
            "name": "periodEnd",
            "type": "i64"
          },
          {
            "name": "fundedAt",
            "type": "i64"
          },
          {
            "name": "totalShares",
            "docs": [
              "Shares outstanding when this revenue was distributed."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "settlementArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "energyWh",
            "type": "u64"
          },
          {
            "name": "proofHash",
            "docs": [
              "SHA-256 of the published readings file for this period."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "readingsCount",
            "type": "u32"
          },
          {
            "name": "periodStart",
            "type": "i64"
          },
          {
            "name": "periodEnd",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tradeEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "investmentVaultSeed",
      "type": "bytes",
      "value": "[105, 110, 118, 101, 115, 116, 109, 101, 110, 116, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "listingSeed",
      "type": "bytes",
      "value": "[108, 105, 115, 116, 105, 110, 103]"
    },
    {
      "name": "marketSeed",
      "type": "bytes",
      "value": "[109, 97, 114, 107, 101, 116]"
    },
    {
      "name": "positionSeed",
      "type": "bytes",
      "value": "[112, 111, 115, 105, 116, 105, 111, 110]"
    },
    {
      "name": "projectSeed",
      "type": "bytes",
      "value": "[112, 114, 111, 106, 101, 99, 116]"
    },
    {
      "name": "revenueSeed",
      "type": "bytes",
      "value": "[114, 101, 118, 101, 110, 117, 101]"
    },
    {
      "name": "revenueVaultSeed",
      "type": "bytes",
      "value": "[114, 101, 118, 101, 110, 117, 101, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "settlementSeed",
      "type": "bytes",
      "value": "[115, 101, 116, 116, 108, 101, 109, 101, 110, 116]"
    },
    {
      "name": "shareDecimals",
      "docs": [
        "Project shares are whole units."
      ],
      "type": "u8",
      "value": "0"
    },
    {
      "name": "shareMintSeed",
      "type": "bytes",
      "value": "[115, 104, 97, 114, 101, 95, 109, 105, 110, 116]"
    }
  ]
};
