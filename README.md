## What it does
This is a Teams App that relays chat messages by storing them in a message queue and providing APIs for periodic polling.

<img width="2066" height="1202" alt="image" src="https://github.com/user-attachments/assets/6a8b265a-d9e2-4fbc-8576-8de1cbcc675f" />

## What does it solve
This solution overcomes the limitations of the UiPath Integration Service Teams Connector to facilitate true real-time interaction between the user and the automated process.

## How to use
1. Provision a new server machine to host this Teams App
2. Assign public domain to the server (e.g. `teamsapp.company.com`)
3. Provision an Azure Bot in Microsoft Azure Portal
4. Prepare icons for this Teams App
5. Clone this repository
6. Create `.env` file, refering to `.env.example`
7. Deploy nodejs server on the new machine and then run it to start listening on ports
8. Adjust `manifest.json` using information from the Azure Bot
9. Create Teams App package: Icon files and `manifest.json`
10. Deploy Teams App using the package
11. Perform tests using this Teams App
