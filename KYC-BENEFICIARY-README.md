# KYC to Cashfree Beneficiary Creation System

This document describes the complete implementation of the automatic KYC to Cashfree beneficiary creation flow.

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Flow](#architecture-flow)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Auto Beneficiary Creation Service](#auto-beneficiary-creation-service)
6. [Auto Retry Job](#auto-retry-job)
7. [Payout Initiation](#payout-initiation)
8. [Frontend Implementation](#frontend-implementation)
9. [Environment Variables](#environment-variables)
10. [Deployment Notes](#deployment-notes)

## System Overview

This system automates the process of:
1. Collecting KYC information from users
2. Storing KYC data with PENDING status
3. Automatically creating Cashfree beneficiaries when KYC is approved
4. Enabling payouts to approved beneficiaries

## Architecture Flow

```
User → Frontend → Backend → KYC DB
Backend → Cashfree API

User submits KYC
    ↓
Backend saves KYC(PENDING)
    ↓
Admin verifies / Auto verifies
    ↓
Backend updates KYC(APPROVED)
    ↓
Auto Beneficiary Service triggers
    ↓
Backend creates beneficiaryId
    ↓
Backend → Cashfree: Add Beneficiary
    ↓
Cashfree returns SUCCESS
    ↓
Backend saves beneficiaryId in user table
```

## Database Schema

### User Model (MongoDB)

Added the following fields to the Member model:

```js
{
  // Existing fields...
  
  // KYC fields
  kycStatus: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "PENDING"
  },
  
  // Cashfree beneficiary fields
  beneficiaryId: String,
  beneficiaryStatus: {
    type: String,
    enum: ["NOT_CREATED", "CREATED"],
    default: "NOT_CREATED"
  }
}
```

## API Endpoints

All endpoints are prefixed with `/kyc`:

### 1. Submit KYC
```
POST /kyc/submit
```

**Request Body:**
```json
{
  "ref_no": "MEMBER123",
  "bankAccount": "1234567890",
  "ifsc": "ABCD0001234",
  "pan": "ABCDE1234F",
  "address": "123 Main Street, City, State"
}
```

**Response:**
```json
{
  "message": "KYC submitted successfully"
}
```

### 2. Approve KYC
```
POST /kyc/approve
```

**Request Body:**
```json
{
  "ref_no": "MEMBER123"
}
```

**Response:**
```json
{
  "message": "KYC approved & beneficiary creation initiated"
}
```

### 3. Get Beneficiary Status
```
GET /kyc/beneficiary/:memberId
```

**Response:**
```json
{
  "kycStatus": "APPROVED",
  "beneficiaryStatus": "CREATED",
  "beneficiaryId": "BEN_MEMBER123"
}
```

### 4. Initiate Payout
```
POST /kyc/payout
```

**Request Body:**
```json
{
  "memberId": "MEMBER123",
  "amount": 500,
  "transferId": "TR_12345"
}
```

**Response:**
```json
{
  "message": "Payout initiated successfully",
  "data": { /* Cashfree API response */ }
}
```

## Auto Beneficiary Creation Service

Located in `controllers/Users/KYC/kycController.js`

When KYC is approved, the system automatically:
1. Generates a unique beneficiary ID (`BEN_{memberId}`)
2. Calls Cashfree's `addBeneficiary` API
3. Updates the user record with the beneficiary ID and status

### Key Features:
- Prevents duplicate beneficiary creation
- Handles API errors gracefully
- Logs all operations for debugging

## Auto Retry Job

Located in `services/beneficiaryRetryService.js`

A cron job that runs every 10 minutes to:
1. Find users with approved KYC but no beneficiary created
2. Attempt to create beneficiaries for those users
3. Handle Cashfree API downtime automatically

This ensures that temporary failures don't prevent beneficiaries from being created.

## Payout Initiation

The system enables payouts through Cashfree's API:
1. Validates that the beneficiary exists
2. Sends payout request with amount and transfer ID
3. Returns Cashfree's response to the frontend

## Frontend Implementation

See `KYC-FRONTEND-GUIDE.md` for detailed React component examples.

Key UI states to implement:
- KYC Pending
- KYC Approved → Beneficiary creating…
- Beneficiary Created ✔
- KYC Rejected

## Environment Variables

Add the following to your `.env` file:

```env
# Cashfree Payout API Credentials (Note: These are different from Payment Gateway credentials)
CASHFREE_APP_ID=your_cashfree_client_id
CASHFREE_SECRET_KEY=your_cashfree_client_secret
```

**Important**: The Payout API requires a two-step authentication process:
1. First, call the `/authorize` endpoint with `x-client-id` and `x-client-secret` headers to obtain a Bearer token
2. Then, use the Bearer token in the `Authorization` header for all subsequent API calls

This has been implemented in the codebase automatically.

## Deployment Notes

1. Ensure `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` are set with valid Cashfree **Payout API** credentials (different from Payment Gateway credentials)
2. The cron job for auto-retry will start automatically when the server starts
3. Test the flow with sandbox credentials before going to production
4. Monitor logs for any beneficiary creation failures
5. Verify that your server's IP address is whitelisted in the Cashfree dashboard for Payout API access

## Error Handling

The system includes comprehensive error handling:
- Network errors when calling Cashfree API
- Validation of required fields
- Duplicate prevention for beneficiary creation
- Graceful degradation when services are unavailable

## Security Considerations

- All API keys are stored in environment variables
- Member data is validated before processing
- Cashfree API responses are logged for auditing
- No sensitive data is exposed in error messages

## Testing

To test the complete flow:
1. Submit KYC data for a member
2. Approve the KYC
3. Verify the beneficiary was created in Cashfree
4. Initiate a payout to the beneficiary
5. Check the auto-retry job handles failures correctly

## Monitoring

Monitor the following:
- Success rate of beneficiary creation
- Payout success rate
- Cron job execution logs
- Error rates in API calls

## Future Enhancements

Consider implementing:
- Webhook integration for real-time beneficiary status updates
- More sophisticated retry logic with exponential backoff
- Admin dashboard for monitoring beneficiary creation status
- Enhanced logging and alerting for failures