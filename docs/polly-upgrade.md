# Amazon Polly Upgrade Guide

This guide walks you through upgrading JARVIS from the built-in text-to-speech engine to Amazon Polly Neural voices. No developer knowledge required beyond copy-pasting a few values.

---

## Why Upgrade?

The built-in JARVIS voice is functional but uses a standard synthesis engine. Amazon Polly's Neural engine sounds noticeably more natural and human — the difference is similar to comparing a 2010 GPS voice to a modern phone assistant. For a CEO who uses JARVIS throughout the day, the experience improvement is significant.

---

## Cost

| Period | Usage included | Cost |
|--------|---------------|------|
| First 12 months | 1,000,000 neural characters/month | Free (AWS Free Tier) |
| After 12 months | Pay per use | ~$16/month for typical personal assistant usage |

1 million characters per month is approximately 3,333 JARVIS responses per day (assuming ~300 characters per response). You are very unlikely to exceed the free tier.

---

## Step 1 — Create a Free AWS Account

1. Go to [https://aws.amazon.com](https://aws.amazon.com) and click **Create a Free Account**.
2. Enter your email address and choose a password.
3. Select **Personal** account type.
4. Enter your credit card — AWS requires it for identity verification but will not charge you within free tier limits.
5. Complete the phone verification step.
6. Choose the **Free** support plan.
7. You will receive a confirmation email. Click the link to activate your account.

---

## Step 2 — Create an IAM User with Polly Access

IAM (Identity and Access Management) lets you create a limited-access user so JARVIS only has permission to call Polly — nothing else in your AWS account.

1. Sign in to the [AWS Console](https://console.aws.amazon.com).
2. In the search bar at the top, type **IAM** and click the IAM service.
3. In the left sidebar, click **Users**.
4. Click **Create user** (top right).
5. For **User name**, enter `jarvis-polly`.
6. Click **Next**.
7. On the permissions page, select **Attach policies directly**.
8. In the search box, type `AmazonPollyReadOnlyAccess`.
9. Tick the checkbox next to `AmazonPollyReadOnlyAccess`.
10. Click **Next**, then **Create user**.

---

## Step 3 — Create an Access Key and Download It

1. From the IAM Users list, click on `jarvis-polly`.
2. Click the **Security credentials** tab.
3. Scroll to **Access keys** and click **Create access key**.
4. Select **Application running outside AWS**.
5. Click **Next**, then **Create access key**.
6. You will see an **Access key ID** and a **Secret access key**.
7. Click **Download .csv file** — save this file somewhere safe. The secret key is shown only once.

The CSV contains two values you need:
- `Access key ID` — looks like `AKIAIOSFODNN7EXAMPLE`
- `Secret access key` — looks like `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

---

## Step 4 — Open JARVIS Settings on Your Phone

1. Open the JARVIS app on your phone.
2. Tap the **Settings** icon (gear wheel, bottom right of the main screen).
3. Scroll to the **Voice Settings** section.

---

## Step 5 — Enter Your AWS Credentials

In the Voice Settings section:

1. Tap **AWS Access Key ID** and paste the Access key ID from the CSV.
2. Tap **AWS Secret Access Key** and paste the Secret access key from the CSV.
3. For **AWS Region**, type `eu-central-1` (Frankfurt — closest to Stuttgart for low latency).
4. For **Polly Voice**, select `Vicki` (German-accented English, Neural) or `Joanna` (US English, Neural) — your preference.
5. Tap **Save**.

---

## Step 6 — Enable Polly in the Backend

On your VPS (or ask your developer to do this):

1. Open the `.env` file in the JARVIS directory:
   ```bash
   nano /opt/jarvis/.env.prod
   ```
2. Add or update the following lines:
   ```
   USE_POLLY=true
   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   AWS_REGION=eu-central-1
   POLLY_VOICE=Joanna
   POLLY_ENGINE=neural
   ```
3. Save the file (Ctrl+O, Enter, Ctrl+X in nano).
4. Redeploy:
   ```bash
   cd /opt/jarvis && ./deploy.sh prod
   ```

---

## Step 7 — Test It

1. Open JARVIS on your phone.
2. Ask any question — for example: "What are my action items for today?"
3. The response should now be spoken in the Polly Neural voice. It typically sounds smoother and more natural than the previous engine.

If you do not hear a difference, check that the backend restarted successfully:
```bash
docker compose -f /opt/jarvis/docker-compose.yml logs --tail=20 backend
```
Look for a line like `Polly TTS engine initialised` in the logs.

---

## Estimated Monthly Usage and Cost

| Scenario | Daily responses | Monthly characters | Monthly cost |
|----------|----------------|-------------------|-------------|
| Light use (meetings only) | ~50 | ~450,000 | Free (year 1) |
| Regular executive use | ~200 | ~1,800,000 | Free yr 1; ~$3.20/mo after |
| Heavy use (all day) | ~500 | ~4,500,000 | Free yr 1; ~$8/mo after |

All estimates assume ~300 characters per JARVIS response. The free tier covers the vast majority of personal assistant use for the full first year.

After the free tier, pricing is $0.000016 per neural character (as of 2026). At 200 responses/day across a year, the annual cost is approximately $14–$20.

---

## Reverting to Built-in Voice

To switch back to the built-in engine at any time:

1. Open `.env.prod` and set `USE_POLLY=false`.
2. Run `./deploy.sh prod`.

Your AWS credentials remain in the file but are inactive until you set `USE_POLLY=true` again.
