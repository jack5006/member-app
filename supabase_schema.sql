-- Supabase Database Schema for MemberPro
-- Run this in your Supabase project's SQL Editor to set up the tables.

-- Drop existing tables if they exist (clean slate)
-- DROP TABLE IF EXISTS transactions;
-- DROP TABLE IF EXISTS members;

-- Create members table
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    points INTEGER NOT NULL DEFAULT 0,
    tier TEXT NOT NULL DEFAULT 'Standard' CHECK (tier IN ('Standard', 'Silver', 'Gold', 'Platinum')),
    join_date TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('TOPUP', 'CONSUME', 'POINT_EARN', 'POINT_SPEND')),
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    points INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable indexes for faster query performance
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_transactions_member_id ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);

-- Disable Row Level Security (RLS) so that the backend can perform queries using the public API key
ALTER TABLE members DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;

