# API Request Engine & Payload Serialization

## Table of Contents
- [1. Request Construction Pipeline](#1-request-construction-pipeline)
- [2. Model Payload Specifications](#2-model-payload-specifications)
  - [2.1 SDXL Payload (`/sdapi/v1/txt2img`)](#21-sdxl-payload-sdapiv1txt2img)
  - [2.2 FLUX Payload (`/sdapi/v1/txt2img`)](#22-flux-payload-sdapiv1txt2img)
  - [2.3 Qwen / Neo Payload (`/sdapi/v1/txt2img`)](#23-qwen--neo-payload-sdapiv1txt2img)
- [3. Advanced Script Extensions](#3-advanced-script-extensions)
  - [3.1 Multi-Unit ControlNet](#31-multi-unit-controlnet)
  - [3.2 Multi-Pass ADetailer Stacking](#32-multi-pass-adetailer-stacking)
  - [3.3 Never-OOM Integrated Execution](#33-never-oom-integrated-execution)

---

## 1. Request Construction Pipeline

The application builds API payloads via `buildJobFromUI()` in `www/js/engine.js`. The engine reads the workspace state, maps configuration inputs into target backend parameters, applies low-bits and memory management overrides, and serializes extension scripts.

```
[User Generation Trigger]
          │
          ▼
`buildJobFromUI()`
          │
          ├── Determine Active Workspace Route ('xl', 'flux', 'qwen', 'anima', 'krea', 'inp')
          ├── Inject Memory Limits & Storage Types (`forge_inference_memory`, `forge_unet_storage_dtype`)
          ├── Build Script Arrays (`alwayson_scripts`)
          │     ├── ControlNet (Up to 3 Units)
          │     ├── ADetailer Multi-Pass Chains
          │     ├── Never-OOM Integrated Tiling
          │     └── First Block Cache / TeaCache (FLUX Mode)
          └── Dispatch Request to Target Endpoint (`/sdapi/v1/txt2img` or `/sdapi/v1/img2img`)
```

---

## 2. Model Payload Specifications

### 2.1 SDXL Payload (`/sdapi/v1/txt2img`)

```json
{
  "prompt": "masterpiece, best quality, 1girl, cinematic lighting",
  "negative_prompt": "low quality, worst quality, blurry",
  "steps": 25,
  "cfg_scale": 7.0,
  "width": 1024,
  "height": 1024,
  "batch_size": 1,
  "n_iter": 1,
  "sampler_name": "Euler a",
  "scheduler": "Normal",
  "seed": -1,
  "save_images": true,
  "do_not_save_grid": true,
  "override_settings": {
    "sd_model_checkpoint": "sd_xl_base_1.0.safetensors",
    "forge_additional_modules": [],
    "sd_vae": "Automatic",
    "forge_unet_storage_dtype": "Automatic",
    "forge_inference_memory": 4980,
    "return_grid": false
  }
}
```

### 2.2 FLUX Payload (`/sdapi/v1/txt2img`)

Includes **Distilled CFG**, specialized module arrays (`VAE`, `CLIP`, `T5`), and optional **First Block Cache / TeaCache** arguments:

```json
{
  "prompt": "a futuristic neon cyberpunk street, 8k resolution",
  "negative_prompt": "",
  "steps": 20,
  "cfg_scale": 1.0,
  "distilled_cfg_scale": 3.5,
  "width": 1024,
  "height": 1024,
  "sampler_name": "Euler",
  "scheduler": "Simple",
  "seed": -1,
  "save_images": true,
  "do_not_save_grid": true,
  "alwayson_scripts": {
    "First Block Cache / TeaCache": {
      "args": [
        true,
        "First Block Cache",
        0.25,
        1,
        3,
        true
      ]
    }
  },
  "override_settings": {
    "sd_model_checkpoint": "flux1-dev-fp8.safetensors",
    "forge_additional_modules": [
      "ae.safetensors",
      "clip_l.safetensors",
      "t5xxl_fp8_e4m3fn.safetensors"
    ],
    "forge_unet_storage_dtype": "fp8 (e4m3fn)",
    "forge_inference_memory": 4980,
    "return_grid": false
  }
}
```

### 2.3 Qwen / Neo Payload (`/sdapi/v1/txt2img`)

Engineered for **Z-Image Turbo / Qwen** architectures using Decoupled-DMD schedules and enforced offloading reserves (`www/js/neo.js`):

```json
{
  "prompt": "macro photograph of a dewdrop on a leaf",
  "negative_prompt": "",
  "steps": 8,
  "cfg_scale": 1.0,
  "width": 1024,
  "height": 1024,
  "batch_size": 1,
  "n_iter": 1,
  "sampler_name": "Euler",
  "scheduler": "Simple",
  "seed": -1,
  "save_images": true,
  "do_not_save_grid": true,
  "override_settings": {
    "sd_model_checkpoint": "qwen_2.5_turbo.safetensors",
    "sd_vae": "Automatic",
    "forge_additional_modules": [
      "qwen_vae.safetensors",
      "qwen_te.safetensors"
    ],
    "forge_unet_storage_dtype": "Automatic",
    "forge_inference_memory": 4980,
    "return_grid": false
  }
}
```

---

## 3. Advanced Script Extensions

### 3.1 Multi-Unit ControlNet

Constructed by `buildControlNetScriptPayload(mode, sourceImg)`. Supports up to **3 concurrent ControlNet units**:

```json
"controlnet": {
  "args": [
    {
      "enabled": true,
      "image": "base64_string...",
      "module": "depth_anything_v2",
      "model": "control_v11f1p_sd15_depth [ce399e2f]",
      "weight": 0.8,
      "resize_mode": 0,
      "guidance_start": 0.0,
      "guidance_end": 1.0,
      "control_mode": 0,
      "processor_res": 512,
      "threshold_a": 100,
      "threshold_b": 200,
      "save_detected_map": false
    },
    { "enabled": false },
    { "enabled": false }
  ]
}
```

### 3.2 Multi-Pass ADetailer Stacking

Constructed by `buildAdetailerScriptPayload(mode)`. Chains multiple restoration passes into a single execution array:

```json
"ADetailer": {
  "args": [
    true,
    {
      "ad_model": "face_yolov8n.pt",
      "ad_prompt": "<lora:detailer_face:0.8>, highly detailed face",
      "ad_negative_prompt": "blurry, distorted",
      "ad_confidence": 0.3,
      "ad_mask_k": 0,
      "ad_mask_filter_method": "Area",
      "ad_mask_merge_invert": "None",
      "ad_mask_blur": 4,
      "ad_denoising_strength": 0.4,
      "ad_inpaint_only_masked": true,
      "ad_inpaint_only_masked_padding": 32
    },
    {
      "ad_model": "hand_yolov8s.pt",
      "ad_prompt": "perfect hands, detailed fingers",
      "ad_negative_prompt": "extra fingers, missing fingers",
      "ad_confidence": 0.2,
      "ad_mask_k": 0,
      "ad_mask_filter_method": "Area",
      "ad_mask_merge_invert": "None",
      "ad_mask_blur": 4,
      "ad_denoising_strength": 0.35,
      "ad_inpaint_only_masked": true,
      "ad_inpaint_only_masked_padding": 32
    }
  ]
}
```

### 3.3 Never-OOM Integrated Execution

Constructed by `buildNeverOomScriptPayload(mode)`. Enforces hardware tiling and offloading:

```json
"never oom integrated": {
  "args": [
    true,  // UNet Always Offload
    true   // VAE Always Tiled
  ]
}
```