# Resolver

<div align="center">

![Latest Release](https://img.shields.io/badge/Platform-Android%2010+-green.svg)
![Backend](https://img.shields.io/badge/Backend-Forge%20Neo-blue)
![Backend](https://img.shields.io/badge/Backend-Comfy%20UI-blue)
![License](https://img.shields.io/badge/License-GPLv3-red.svg)
<a href="https://bojrodev.com/donate">
<img src="https://img.shields.io/badge/SUPPORT-Donate-00C853?style=for-the-badge&logo=tether&logoColor=white"/>
</a>

<br><br>

<a href="https://github.com/bojrodev/Resolver-WebUI-Forge-Client/releases">
<img src="https://img.shields.io/github/downloads/bojrodev/Resolver-WebUI-Forge-Client/total?style=for-the-badge&label=Download%20APK&logo=android&color=3DDC84"/>
</a>

</div>
<br>

**Resolver** is an open-source, high-performance native Android interface for AI image generation. It provides a seamless mobile experience for interacting with WebUI Forge and ComfyUI backends, ensuring your generation queues stay active even when your screen is off.

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Requirements](#requirements)
- [Quickstart](#quickstart)
- [Backend Setup](#backend-setup-mandatory)
- [Magic Prompt (LLM) Setup](#magic-prompt-llm-setup)
- [Remote PC Wake](#remote-pc-wake)
- [Installation](#installation)
- [Architecture](#architecture)
- [Support the Developer](#support-the-developer)
- [License](#license)

## Quickstart

To get started with development, clone the repository, install dependencies with `npm install`, run `npx cap sync`, and then `npx cap open android` to launch in Android Studio.

## Features

### Core Engines
- **Forge WebUI Integration:** Natively optimized for WebUI Forge Neo.
- **ComfyUI Orchestration:** Execute `.json` workflows with dynamic UI generation (sliders, dropdowns, and inputs).
- **Flux and SDXL Powerhouse:** Full control over sampling, scheduling, and Flux First Block Cache (FBC) optimizations.
- **Qwen / Z-Image:** Specialized mode for dense narrative-to-image support.

### Advanced Capabilities
- **True Background Generation:** Java-based Foreground Service with Wake Locks keeps tasks running while the app is minimized.
- **Native Metadata Analysis:** Built-in viewer to analyze and reuse generation parameters directly from your local history.
- **Live WebSocket Feedback:** Real-time step monitoring and binary image previews.
- **Magic Prompt:** Connect to local LLMs (LM Studio/Ollama) to expand simple ideas into complex prompts using Bojro PromptMaster.
- **Mobile Inpainting:** Touch-optimized canvas editor with mask blurring and denoising controls.

### Remote Management
- **Smart Connection:** Seamlessly toggle between Local (LAN) and External (HTTPS/Ngrok) modes.
- **Power Control:** Integrated remote `KILL!` signal to halt backend services instantly.
- **Remote Wake:** Integration with Bojro Power helper for remote system startup.

## Screenshots

<table>
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/51de1657-b0d9-42f9-b661-8b12cf00b8b2" width="200" /><br />
      <b>Home / SDXL TAB</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/eeaf30ac-7b93-4791-b82f-2e67159e0350" width="200" /><br />
      <b>Flux UI</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/659ff2d9-f8e1-42a8-a73a-01b9273ab574" width="200" /><br />
      <b>QWEN / Z-IMAGE TAB</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/39b24f96-6363-43b0-8d40-2bff331b84b3" width="200" /><br />
      <b>Inpainting</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/fa8f194d-8bce-4b36-b462-61066007e8b7" width="200" /><br />
      <b>Lora Tab</b>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/f6770c4f-4f05-4a94-b5c2-062945531797" width="200" /><br />
      <b>Configuration Tab</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/af49aabc-eb80-4b5b-845a-7c7f3b7483f8" width="200" /><br />
      <b>Magic Prompt Tab</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/4575b557-e086-4238-a1df-ae154bd239f7" width="200" /><br />
      <b>Gallery Tab</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/8475ea5d-28da-42e2-8bb4-04277bbd3cb9" width="200" /><br />
      <b>Metadata viewer Tab</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/19ee57c1-d1f4-46e6-b2fc-a1c58e17fe63" width="200" /><br />
      <b>Queue Tab</b>
    </td>
  </tr>
</table>

## Requirements

- Android 10.0 (API 29) or higher
- A running instance of WebUI Forge or ComfyUI
- Shared Wi-Fi network (for local connection)

## Backend Setup (Mandatory)

To allow Resolver to communicate with your PC, you must enable API access:

**WebUI Forge:**
In `webui-user.bat`, set `COMMANDLINE_ARGS` to include `--listen --api --cors-allow-origins *`

**ComfyUI:**
Append `--listen` and `--enable-cors-header *` to your launch command.

## Magic Prompt (LLM) Setup

1. **Model:** Download **[PromptMaster v2](https://huggingface.co/bojrodev/BojroPromptMaster_uncensored_v2-8B)** from HuggingFace.
2. **Host:** Load the model into LM Studio or Ollama.
3. **Link:** Enter your PC IP or Server URL in the Resolver Bot modal.

## Remote PC Wake

Requires the Bojro Power (`BojroPowerv_x_portable.exe`) utility running on the host PC.
- Set the Wake Port (Default: 5000) in the CFG Tab.
- Use the Power Icon (ტ) to trigger the wake signal through the Bojro Power helper.

## Installation

1. Download the latest `.apk` from the Releases page.
2. Install on your Android device.
3. Open the CFG Tab, enter your PC IP address, and save.

## Architecture

Resolver utilizes a Hybrid Mobile Architecture to balance UI flexibility with system-level performance:
- **Frontend:** Vanilla JS + Capacitor 6.0 for a responsive UI.
- **Backend Communication:** REST API for state sync and WebSockets for real-time image streaming.
- **Native Layer:** Java-based Android Foreground Services with Wake Locks to ensure background task persistence.

---

## <a id="support-the-developer"></a>💖 Support the Developer

Resolver is completely free and open-source. If you find this app useful and want to support its ongoing development, please consider leaving a tip! Donations help cover the costs of testing devices, servers, and training custom LLM models for the ecosystem.

👉 **[Donate via Crypto (USDT)](https://bojrodev.com/donate)**

---

## License

This project is licensed under the GPLv3 License.
