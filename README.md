# CoralEye 🪸🤖
**A Decentralized Computer Vision Framework for Proactive Thermal Stress Diagnostics in the Coral Triangle.**

This repository contains the official code, weights, and evaluation scripts for the CoralEye research paper.

## Overview
Current coral monitoring suffers from a "manual-annotation bottleneck." CoralEye resolves this by deploying an edge-optimized Deep Learning framework (MobileNetV2) capable of categorizing coral health in real-time. It moves beyond binary "live/dead" metrics by implementing a 5-class (C1-C5) physiological taxonomy to identify early-stage *paling* (C2).

### Key Features
* **Edge Optimized:** Achieves ~45ms inference latency on standard consumer hardware (no cloud needed).
* **Physics-Informed:** Includes a custom `SunGlintCorrectionLayer` based on the Cox-Munk wave-slope distribution to normalize aerial UAV imagery.
* **High Accuracy:** Validated at 99.2% accuracy on the Benthic Habitat Data (BHD) dataset.

## Repository Structure
* `train_coraleye.py`: The main training loop including the custom SSGCL physics layer.
* `evaluate_metrics.py`: Script to generate the Confusion Matrix and run latency benchmarking.
* `coral_eye_v2_model_official.keras`: The pre-trained weights for deployment.

