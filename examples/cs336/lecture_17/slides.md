---
title: "CS336 Lecture 17: Multimodal models"
lang: en
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-content'
renderers:
  slides: {}
---

(cs336-17-cover)=
# Lecture 17: Multimodal models

Stanford CS336 · Language Modeling from Scratch · Spring 2026.


(cs336-17-section-001)=
## Lecture 17: multimodal models

:::{slide}
:label: cs336-17-001-output-001
:at: 0
So far: language models
:::

:::{slide}
:label: cs336-17-001-output-002
:at: 1
> text ⇒ text
:::

:::{slide}
:label: cs336-17-001-output-003
:at: 2
The world is multimodal:
:::

:::{slide}
:label: cs336-17-001-output-004
:at: 3
![multimodality.png](../source/images/multimodality.png)
:::


(cs336-17-section-002)=
## Lecture 17: multimodal models

:::{slide}
:label: cs336-17-002-output-001
:at: 0
Ultimate goal: **omni model**
:::

:::{slide}
:label: cs336-17-002-output-002
:at: 1
- Input any combination of modalities (understanding)
:::

:::{slide}
:label: cs336-17-002-output-003
:at: 2
- Output any combination of modalities (generation)
:::

:::{slide}
:label: cs336-17-002-output-004
:at: 3
Where we are today:
:::

:::{slide}
:label: cs336-17-002-output-005
:at: 4
- Transformers work really well. So we gotta use them.
:::


(cs336-17-section-003)=
## Lecture 17: multimodal models

:::{slide}
:label: cs336-17-003-output-001
:at: 0
- Transformers speak tokens (discrete or continuous), where a token represents some ~semantic unit of information.
:::

:::{slide}
:label: cs336-17-003-output-002
:at: 1
- Therefore, we must convert everything into tokens.
:::

:::{slide}
:label: cs336-17-003-output-003
:at: 2
- Note: we had to do this with text (recall the tokenization lecture).
:::

:::{slide}
:label: cs336-17-003-output-004
:at: 3
- For non-text modalities, this is more challenging...
:::

:::{slide}
:label: cs336-17-003-output-005
:at: 4
Questions:
:::


(cs336-17-section-004)=
## Lecture 17: multimodal models

:::{slide}
:label: cs336-17-004-output-001
:at: 0
1. How do we input non-text data (e.g., understand images)?
:::

:::{slide}
:label: cs336-17-004-output-002
:at: 1
2. How do we output non-text data (e.g., generate audio)?
:::


(cs336-17-section-005)=
## CLIP

:::{slide}
:label: cs336-17-005-output-001
:at: 0
CLIP (Contrastive Language-Image Pretraining) 

[Radford+ 2021](https://arxiv.org/abs/2103.00020)
:::

:::{slide}
:label: cs336-17-005-output-002
:at: 1
Context:
:::

:::{slide}
:label: cs336-17-005-output-003
:at: 2
- Computer vision models were trained on annotated images.
:::

:::{slide}
:label: cs336-17-005-output-004
:at: 3
- Question: is it possible to leverage the much larger amount of (image, caption) pairs?
:::

:::{slide}
:label: cs336-17-005-output-005
:at: 4
![clip.png](../source/images/clip.png)
:::


(cs336-17-section-006)=
## CLIP

:::{slide}
:label: cs336-17-006-output-001
:at: 0
Method:
:::

:::{slide}
:label: cs336-17-006-output-002
:at: 1
- Get a batch of (image, text) examples (e.g., 32768)
:::

:::{slide}
:label: cs336-17-006-output-003
:at: 2
- Encode each image and each text
:::

:::{slide}
:label: cs336-17-006-output-004
:at: 3
- For each image, prefer its aligned text over other texts
:::

:::{slide}
:label: cs336-17-006-output-005
:at: 4
- For each text, prefer its aligned image over other images
:::


(cs336-17-section-007)=
## CLIP

:::{slide}
:label: cs336-17-007-output-001
:at: 0
![clip-code.png](../source/images/clip-code.png)
:::

:::{slide}
:label: cs336-17-007-output-002
:at: 1
Data:
:::

:::{slide}
:label: cs336-17-007-output-003
:at: 2
- Searched for 500K queries, get ~20K (image, text) pairs per query
:::

:::{slide}
:label: cs336-17-007-output-004
:at: 3
- Trained on 400M image-text pairs
:::

:::{slide}
:label: cs336-17-007-output-005
:at: 4
- Didn't release the dataset
:::


(cs336-17-section-008)=
## CLIP

:::{slide}
:label: cs336-17-008-output-001
:at: 0
- Reproduced in OpenCLIP (using LAION-5B dataset, which used CLIP for filtering) 

[Cherti+ 2022](https://arxiv.org/abs/2212.07143)
:::

:::{slide}
:label: cs336-17-008-output-002
:at: 1
Data processing 

[code](https://github.com/openai/CLIP/blob/main/clip/clip.py#L79)
:::

:::{slide}
:label: cs336-17-008-output-003
:at: 2
- Images come in all resolutions (arbitrary W x H)
:::

:::{slide}
:label: cs336-17-008-output-004
:at: 3
- Resize using bicubic interpolation so shorter side is 336 pixels
:::

:::{slide}
:label: cs336-17-008-output-005
:at: 4
- Center crop (cuts off borders to get 336 x 336)
:::


(cs336-17-section-009)=
## CLIP

:::{slide}
:label: cs336-17-009-output-001
:at: 0
Vision encoder:
:::

:::{slide}
:label: cs336-17-009-output-002
:at: 1
- Experimented with ResNet-50 and Vision Transformers 

[Dosovitskiy+ 2020](https://arxiv.org/pdf/2010.11929)
:::

:::{slide}
:label: cs336-17-009-output-003
:at: 2
![vit.png](../source/images/vit.png)
:::

:::{slide}
:label: cs336-17-009-output-004
:at: 3
- Attention pooling: do QKV with query = global average of activations
:::

:::{slide}
:label: cs336-17-009-output-005
:at: 4
- Best model: ViT-L/14@336px (L = large, 14x14 patches, 3 channels, trained on 336x336 resolution images)
:::


(cs336-17-section-010)=
## CLIP

:::{slide}
:label: cs336-17-010-output-001
:at: 0
Text encoder:
:::

:::{slide}
:label: cs336-17-010-output-002
:at: 1
- GPT-2 Transformer (63M parameters, 12 layers)
:::

:::{slide}
:label: cs336-17-010-output-003
:at: 2
- Encode [BOS] ... [EOS], return [EOS] activation at highest layer
:::

:::{slide}
:label: cs336-17-010-output-004
:at: 3
Headline result:
:::

:::{slide}
:label: cs336-17-010-output-005
:at: 4
- On ImageNet, zero-shot CLIP outperformed ResNet-50 trained on 1.2M ImageNet images
:::


(cs336-17-section-011)=
## CLIP

:::{slide}
:label: cs336-17-011-output-001
:at: 0
Ablation:
:::

:::{slide}
:label: cs336-17-011-output-002
:at: 1
- Alternative: predict text from images directly
:::

:::{slide}
:label: cs336-17-011-output-003
:at: 2
- Much less compute efficient compared to CLIP-style ranking
:::

:::{slide}
:label: cs336-17-011-output-004
:at: 3
![clip-efficiency.png](../source/images/clip-efficiency.png)
:::

:::{slide}
:label: cs336-17-011-output-005
:at: 4
Summary:
:::


(cs336-17-section-012)=
## CLIP

:::{slide}
:label: cs336-17-012-output-001
:at: 0
- Encoding of images captures semantics given by (noisy) text
:::

:::{slide}
:label: cs336-17-012-output-002
:at: 1
- Design decisions chosen based on image classification (not very fine-grained)
:::

:::{slide}
:label: cs336-17-012-output-003
:at: 2
- Technical: requires large batch sizes, softmax operation over full batch
:::


(cs336-17-section-013)=
## SigLIP

:::{slide}
:label: cs336-17-013-output-001
:at: 0
SigLIP (Sigmoid Loss for Language Image Pre-Training) 

[Zhai+ 2023](https://arxiv.org/abs/2303.15343)
:::

:::{slide}
:label: cs336-17-013-output-002
:at: 1
Objective:
:::

:::{slide}
:label: cs336-17-013-output-003
:at: 2
- CLIP: multiclass classification for (text, image) versus (text, image') for all image'
:::

:::{slide}
:label: cs336-17-013-output-004
:at: 3
- SigLIP: binary classification for (text, image) - aligned or not?
:::

:::{slide}
:label: cs336-17-013-output-005
:at: 4
![siglip-code.png](../source/images/siglip-code.png)
:::


(cs336-17-section-014)=
## SigLIP

:::{slide}
:label: cs336-17-014-output-001
:at: 0
Data:
:::

:::{slide}
:label: cs336-17-014-output-002
:at: 1
- WebLI dataset: O(billion) (image, text) pairs 

[Chen+ 2022](https://arxiv.org/pdf/2209.06794)
:::

:::{slide}
:label: cs336-17-014-output-003
:at: 2
- Scraped from the Internet
:::

:::{slide}
:label: cs336-17-014-output-004
:at: 3
- Used automatic OCR to extract text from images
:::

:::{slide}
:label: cs336-17-014-output-005
:at: 4
- Keep 10% highest quality
:::


(cs336-17-section-015)=
## SigLIP

:::{slide}
:label: cs336-17-015-output-001
:at: 0
- Supports 100 languages
:::

:::{slide}
:label: cs336-17-015-output-002
:at: 1
Efficiency:
:::

:::{slide}
:label: cs336-17-015-output-003
:at: 2
- CLIP: 10 days on 256 TPUv3
:::

:::{slide}
:label: cs336-17-015-output-004
:at: 3
- SigLIP: 5 days on 32 TPUv4 (lower FLOP/s than TPUv3) - much faster!
:::

:::{slide}
:label: cs336-17-015-output-005
:at: 4
![siglip-parallelism.png](../source/images/siglip-parallelism.png)
:::


(cs336-17-section-016)=
## SigLIP

:::{slide}
:label: cs336-17-016-output-001
:at: 0
Batch size:
:::

:::{slide}
:label: cs336-17-016-output-002
:at: 1
- Decouple batch size from loss
:::

:::{slide}
:label: cs336-17-016-output-003
:at: 2
- Better than CLIP for <16K batch sizes
:::

:::{slide}
:label: cs336-17-016-output-004
:at: 3
- Go up to 1M batch size, but 32K is enough
:::


(cs336-17-section-017)=
## LLaVA

:::{slide}
:label: cs336-17-017-output-001
:at: 0
LLaVA (Large Language and Vision Assistant) 

[Liu+ 2023](https://arxiv.org/abs/2304.08485)
:::

:::{slide}
:label: cs336-17-017-output-002
:at: 1
Vision encoder: CLIP
:::

:::{slide}
:label: cs336-17-017-output-003
:at: 2
Text decoder: Vicuna (LLaMA fine-tuned on ShareGPT conversations) 

[post](https://www.lmsys.org/blog/2023-03-30-vicuna/)
:::

:::{slide}
:label: cs336-17-017-output-004
:at: 3
Data:
:::

:::{slide}
:label: cs336-17-017-output-005
:at: 4
- MS COCO has images annotated with bounding boxes and Mechanical Turk captions
:::


(cs336-17-section-018)=
## LLaVA

:::{slide}
:label: cs336-17-018-output-001
:at: 0
- Prompt GPT-4 with captions or detected objects and generate questions or conversations
:::

:::{slide}
:label: cs336-17-018-output-002
:at: 1
- Pair generations with original images
:::

:::{slide}
:label: cs336-17-018-output-003
:at: 2
- 158K examples
:::

:::{slide}
:label: cs336-17-018-output-004
:at: 3
![llava-gen.png](../source/images/llava-gen.png)
:::

:::{slide}
:label: cs336-17-018-output-005
:at: 4
Model:
:::


(cs336-17-section-019)=
## LLaVA

:::{slide}
:label: cs336-17-019-output-001
:at: 0
- Encode images with CLIP (ViT-L/14)
:::

:::{slide}
:label: cs336-17-019-output-002
:at: 1
- Linear projection (W) into embedding space (Flamingo and Q-former are more complex)
:::

:::{slide}
:label: cs336-17-019-output-003
:at: 2
![llava-architecture.png](../source/images/llava-architecture.png)
:::

:::{slide}
:label: cs336-17-019-output-004
:at: 3
Training:
:::

:::{slide}
:label: cs336-17-019-output-005
:at: 4
- Stage 1 (alignment): freeze vision encoder and language model, only train W
:::


(cs336-17-section-020)=
## LLaVA

:::{slide}
:label: cs336-17-020-output-001
:at: 0
- Stage 2 (fine-tuning): freeze vision encoder and train W and language model
:::

:::{slide}
:label: cs336-17-020-output-002
:at: 1
![llava-example.png](../source/images/llava-example.png)
:::


(cs336-17-section-021)=
## LLaVA onevision

:::{slide}
:label: cs336-17-021-output-001
:at: 0
LLaVA OneVision 

[Li+ 2024](https://arxiv.org/pdf/2408.03326)
:::

:::{slide}
:label: cs336-17-021-output-002
:at: 1
- Latest version in the LLaVA series (after LLaVA 1.5, LLaVA-Next)
:::

:::{slide}
:label: cs336-17-021-output-003
:at: 2
- Handle multiple images, video
:::

:::{slide}
:label: cs336-17-021-output-004
:at: 3
![llava-onevision.png](../source/images/llava-onevision.png)
:::

:::{slide}
:label: cs336-17-021-output-005
:at: 4
- Vision encoder: SigLIP (use grid features before and after last Transformer layer)
:::


(cs336-17-section-022)=
## LLaVA onevision

:::{slide}
:label: cs336-17-022-output-001
:at: 0
- Text decoder: Qwen-2 72B
:::

:::{slide}
:label: cs336-17-022-output-002
:at: 1
- Projector: 2-layer MLP
:::

:::{slide}
:label: cs336-17-022-output-003
:at: 2
Data processing:
:::

:::{slide}
:label: cs336-17-022-output-004
:at: 3
- Preserving high resolution is important (e.g., for OCR)
:::

:::{slide}
:label: cs336-17-022-output-005
:at: 4
- CLIP resizes and crops to 336x336, which loses information
:::


(cs336-17-section-023)=
## LLaVA onevision

:::{slide}
:label: cs336-17-023-output-001
:at: 0
- Solution: AnyRes, introduced in LLaVA 1.5 

[paper](https://static.hliu.cc/files/llava/improved_llava.pdf)
:::

:::{slide}
:label: cs336-17-023-output-002
:at: 1
- Break up image into a x b pieces (matching resolution of vision encoder), encode, concatenate
:::

:::{slide}
:label: cs336-17-023-output-003
:at: 2
- If too many tokens (original image is too high resolution), then use bilinear interpolation
:::

:::{slide}
:label: cs336-17-023-output-004
:at: 3
![llava-onevision-anyres.png](../source/images/llava-onevision-anyres.png)
:::

:::{slide}
:label: cs336-17-023-output-005
:at: 4
Handle 3 types of input (single image, multiple images, video):
:::


(cs336-17-section-024)=
## LLaVA onevision

:::{slide}
:label: cs336-17-024-output-001
:at: 0
- Goal: make all of the modalities produce roughly the same length
:::

:::{slide}
:label: cs336-17-024-output-002
:at: 1
![llava-onevision-modalities.png](../source/images/llava-onevision-modalities.png)
:::

:::{slide}
:label: cs336-17-024-output-003
:at: 2
- Single image: use higher resolution
:::

:::{slide}
:label: cs336-17-024-output-004
:at: 3
- Multiple images: use base resolution for each image
:::

:::{slide}
:label: cs336-17-024-output-005
:at: 4
- Video: use lower resolution for each frame
:::


(cs336-17-section-025)=
## LLaVA onevision

:::{slide}
:label: cs336-17-025-output-001
:at: 0
Data:
:::

:::{slide}
:label: cs336-17-025-output-002
:at: 1
- Philosophy: quality over quantity
:::

:::{slide}
:label: cs336-17-025-output-003
:at: 2
![llava-onevision-data-1.png](../source/images/llava-onevision-data-1.png)
:::

:::{slide}
:label: cs336-17-025-output-004
:at: 3
![llava-onevision-data-2.png](../source/images/llava-onevision-data-2.png)
:::

:::{slide}
:label: cs336-17-025-output-005
:at: 4
Training:
:::


(cs336-17-section-026)=
## LLaVA onevision

:::{slide}
:label: cs336-17-026-output-001
:at: 0
- Philosophy: easier to harder
:::

:::{slide}
:label: cs336-17-026-output-002
:at: 1
![llava-onevision-training.png](../source/images/llava-onevision-training.png)
:::

:::{slide}
:label: cs336-17-026-output-003
:at: 2
Transfer between modalities:
:::

:::{slide}
:label: cs336-17-026-output-004
:at: 3
- Single image data for diagrams and charts, but generalize to multi-image
:::

:::{slide}
:label: cs336-17-026-output-005
:at: 4
![llava-onevision-transfer-s1.png](../source/images/llava-onevision-transfer-s1.png)
:::


(cs336-17-section-027)=
## LLaVA onevision

:::{slide}
:label: cs336-17-027-output-001
:at: 0
- OCR on single image data, relational reasoning from multi-image data, generalize to GUI-based agents
:::

:::{slide}
:label: cs336-17-027-output-002
:at: 1
![llava-onevision-transfer-s2.png](../source/images/llava-onevision-transfer-s2.png)
:::

:::{slide}
:label: cs336-17-027-output-003
:at: 2
- Visual prompting (circle) in single images, generalize to videos
:::

:::{slide}
:label: cs336-17-027-output-004
:at: 3
![llava-onevision-transfer-s8.png](../source/images/llava-onevision-transfer-s8.png)
:::

:::{slide}
:label: cs336-17-027-output-005
:at: 4
Summary:
:::


(cs336-17-section-028)=
## LLaVA onevision

:::{slide}
:label: cs336-17-028-output-001
:at: 0
- Standard VLM template: vision encoder + projector + LM
:::

:::{slide}
:label: cs336-17-028-output-002
:at: 1
- Most work goes into data curation (heavy on synthesized, task-specific data)
:::

:::{slide}
:label: cs336-17-028-output-003
:at: 2
- Open-source (released model weights and data)
:::


(cs336-17-section-029)=
## Qwen VL

:::{slide}
:label: cs336-17-029-output-001
:at: 0
Qwen-VL 

[Bai+ 2023](https://arxiv.org/abs/2308.12966)
:::

:::{slide}
:label: cs336-17-029-output-002
:at: 1
Architecture:
:::

:::{slide}
:label: cs336-17-029-output-003
:at: 2
- Vision encoder: OpenCLIP's ViT-bigC (14x14 patches) 

[Cherti+ 2022](https://arxiv.org/abs/2212.07143)
:::

:::{slide}
:label: cs336-17-029-output-004
:at: 3
- Adaptor: one layer cross-attention, incorporate 2D positional encodings, maps to fixed length of 256
:::

:::{slide}
:label: cs336-17-029-output-005
:at: 4
- Special tokens: &lt;img>, &lt;box>, &lt;ref>
:::


(cs336-17-section-030)=
## Qwen VL

:::{slide}
:label: cs336-17-030-output-001
:at: 0
Training:
:::

:::{slide}
:label: cs336-17-030-output-002
:at: 1
![qwen-vl-stages.png](../source/images/qwen-vl-stages.png)
:::

:::{slide}
:label: cs336-17-030-output-003
:at: 2
- Stage 1: large-scale low quality data; freeze LM, train vision encoder + adaptor
:::

:::{slide}
:label: cs336-17-030-output-004
:at: 3
![qwen-vl-stage1.png](../source/images/qwen-vl-stage1.png)
:::

:::{slide}
:label: cs336-17-030-output-005
:at: 4
- Stage 2: higher quality task-specific data, increase resolution; train all parameters
:::


(cs336-17-section-031)=
## Qwen VL

:::{slide}
:label: cs336-17-031-output-001
:at: 0
![qwen-vl-stage2.png](../source/images/qwen-vl-stage2.png)
:::

:::{slide}
:label: cs336-17-031-output-002
:at: 1
- Stage 3: instruction tuning data; freeze visual encoder, train adaptor + LM
:::

:::{slide}
:label: cs336-17-031-output-003
:at: 2
![qwen-vl-examples.png](../source/images/qwen-vl-examples.png)
:::


(cs336-17-section-032)=
## Qwen2 VL

:::{slide}
:label: cs336-17-032-output-001
:at: 0
Qwen2-VL 

[Wang+ 2024](https://arxiv.org/abs/2409.12191)
:::

:::{slide}
:label: cs336-17-032-output-002
:at: 1
Visual encoder: larger ViT (675M)
:::

:::{slide}
:label: cs336-17-032-output-003
:at: 2
![qwen2-vl-architecture.png](../source/images/qwen2-vl-architecture.png)
:::

:::{slide}
:label: cs336-17-032-output-004
:at: 3
- Key: dynamic resolution to handle varying resolutions
:::

:::{slide}
:label: cs336-17-032-output-005
:at: 4
- Each 224 x 224 patch encoded with ViT/14, compress every 2x2 => 66 tokens
:::


(cs336-17-section-033)=
## Qwen2 VL

:::{slide}
:label: cs336-17-033-output-001
:at: 0
- Video: sample 2 frames/sec, max 16384 tokens
:::

:::{slide}
:label: cs336-17-033-output-002
:at: 1
Multimodal Rotary Position Embedding (MRoPE):
:::

:::{slide}
:label: cs336-17-033-output-003
:at: 2
![qwen2-vl-mrope.png](../source/images/qwen2-vl-mrope.png)
:::

:::{slide}
:label: cs336-17-033-output-004
:at: 3
Initialize LM with Qwen2 and vision encoder from DFN 

[Fang+ 2023](https://arxiv.org/abs/2309.17425)
:::

:::{slide}
:label: cs336-17-033-output-005
:at: 4
Training (similar to Qwen-VL):
:::


(cs336-17-section-034)=
## Qwen2 VL

:::{slide}
:label: cs336-17-034-output-001
:at: 0
- Stage 1: train only visual encoder
:::

:::{slide}
:label: cs336-17-034-output-002
:at: 1
- Stage 2: train all parameters
:::

:::{slide}
:label: cs336-17-034-output-003
:at: 2
- Stage 3: train language model on instruction following datasets
:::

:::{slide}
:label: cs336-17-034-output-004
:at: 3
Many capabilities:
:::

:::{slide}
:label: cs336-17-034-output-005
:at: 4
![qwen2-vl-capabilities.png](../source/images/qwen2-vl-capabilities.png)
:::


(cs336-17-section-035)=
## Qwen3 VL

:::{slide}
:label: cs336-17-035-output-001
:at: 0
Qwen3-VL 

[Bai+ 2025](https://arxiv.org/abs/2511.21631)
:::

:::{slide}
:label: cs336-17-035-output-002
:at: 1
![qwen3-vl.png](../source/images/qwen3-vl.png)
:::

:::{slide}
:label: cs336-17-035-output-003
:at: 2
Language model:
:::

:::{slide}
:label: cs336-17-035-output-004
:at: 3
- Qwen-3 models (dense and MoE models up to 235B-A22B)
:::

:::{slide}
:label: cs336-17-035-output-005
:at: 4
- Long context understanding (256K)
:::


(cs336-17-section-036)=
## Qwen3 VL

:::{slide}
:label: cs336-17-036-output-001
:at: 0
Vision encoder:
:::

:::{slide}
:label: cs336-17-036-output-002
:at: 1
- SigLIP-2 (same architecture as SigLIP) 

[Tschannen+ 2025](https://arxiv.org/pdf/2502.14786)
:::

:::{slide}
:label: cs336-17-036-output-003
:at: 2
- Interleaved MRoPE: distribute all axes (temporal, width, height) to low- and high-frequency bands
:::

:::{slide}
:label: cs336-17-036-output-004
:at: 3
... [t w h t w h t w h t w h] rather than [t t t t w w w w h h h h]
:::

:::{slide}
:label: cs336-17-036-output-005
:at: 4
- Add explicit video timestamps (as separate tokens rather in positional embeddings)
:::


(cs336-17-section-037)=
## Qwen3 VL

:::{slide}
:label: cs336-17-037-output-001
:at: 0
- Square-root-normalized per-token loss: balance text and multimodal data (video examples are long, don't want to dominate)
:::

:::{slide}
:label: cs336-17-037-output-002
:at: 1
Adapter:
:::

:::{slide}
:label: cs336-17-037-output-003
:at: 2
- DeepStack: cross-layer fusion to inject visual information into multiple layers 

[Meng+ 2024](https://arxiv.org/abs/2406.04334)
:::

:::{slide}
:label: cs336-17-037-output-004
:at: 3
Training:
:::

:::{slide}
:label: cs336-17-037-output-005
:at: 4
- Pre-training has 4 stages (train adapter, train all parameters on 8K, 32K, 256K lengths)
:::


(cs336-17-section-038)=
## Qwen3 VL

:::{slide}
:label: cs336-17-038-output-001
:at: 0
![qwen3-vl-pretraining.png](../source/images/qwen3-vl-pretraining.png)
:::

:::{slide}
:label: cs336-17-038-output-002
:at: 1
- Post-training: SFT on long CoT data, knowledge distillation, RL
:::

:::{slide}
:label: cs336-17-038-output-003
:at: 2
![qwen3-vl-results.png](../source/images/qwen3-vl-results.png)
:::

:::{slide}
:label: cs336-17-038-output-004
:at: 3
Summary:
:::

:::{slide}
:label: cs336-17-038-output-005
:at: 4
- SOTA performance
:::


(cs336-17-section-039)=
## Qwen3 VL

:::{slide}
:label: cs336-17-039-output-001
:at: 0
- Lots of data work, but not many details
:::

:::{slide}
:label: cs336-17-039-output-002
:at: 1
- Minor but potentially important architectural improvements
:::

:::{slide}
:label: cs336-17-039-output-003
:at: 2
- Scale up
:::


(cs336-17-section-040)=
## Chameleon

:::{slide}
:label: cs336-17-040-output-001
:at: 0
Chameleon 

[Chameleon Team 2024](https://arxiv.org/pdf/2405.09818)
:::

:::{slide}
:label: cs336-17-040-output-002
:at: 1
So far: VLMs encode images (via CLIP or SigLIP), inject into LM
:::

:::{slide}
:label: cs336-17-040-output-003
:at: 2
Disadvantage: can't generate images (need diffusion)
:::

:::{slide}
:label: cs336-17-040-output-004
:at: 3
Chameleon: map everything into discrete tokens
:::

:::{slide}
:label: cs336-17-040-output-005
:at: 4
Advantage: can analyze and generate images in a uniform way
:::


(cs336-17-section-041)=
## Chameleon

:::{slide}
:label: cs336-17-041-output-001
:at: 0
![chameleon.png](../source/images/chameleon.png)
:::

:::{slide}
:label: cs336-17-041-output-002
:at: 1
![chameleon-example.png](../source/images/chameleon-example.png)
:::

:::{slide}
:label: cs336-17-041-output-003
:at: 2
Vision encoder 

[Gafni+ 2022](https://arxiv.org/pdf/2203.13131)
:::

:::{slide}
:label: cs336-17-041-output-004
:at: 3
- Key difference: encoder needs to map to discrete tokens (so we can generate them)
:::

:::{slide}
:label: cs336-17-041-output-005
:at: 4
- VQ-VAE (Vector Quantized Variational Autoencoder) 

[Oord+ 2017](https://arxiv.org/pdf/1711.00937)
:::


(cs336-17-section-042)=
## Chameleon

:::{slide}
:label: cs336-17-042-output-001
:at: 0
- Idea: map image to a discrete codebook, decode back to image and minimize reconstruction loss
:::

:::{slide}
:label: cs336-17-042-output-002
:at: 1
![vq-vae.png](../source/images/vq-vae.png)
:::

:::{slide}
:label: cs336-17-042-output-003
:at: 2
- Encodes 512 x 512 image into 1024 tokens (codebook of size 8192)
:::

:::{slide}
:label: cs336-17-042-output-004
:at: 3
- Train a new BPE tokenizer
:::

:::{slide}
:label: cs336-17-042-output-005
:at: 4
Training:
:::


(cs336-17-section-043)=
## Chameleon

:::{slide}
:label: cs336-17-043-output-001
:at: 0
- Stage 1 (80%): large-scale, unsupervised (2.9T text tokens, 1.5T text/image tokens, 400B text/image interleaved tokens)
:::

:::{slide}
:label: cs336-17-043-output-002
:at: 1
- Stage 2 (20%): 50% of stage 1 data, 50% of high quality data
:::

:::{slide}
:label: cs336-17-043-output-003
:at: 2
Training stability
:::

:::{slide}
:label: cs336-17-043-output-004
:at: 3
- Text tokens have low entropy, image tokens have high entropy, leads to norm growth, logit drift problem
:::

:::{slide}
:label: cs336-17-043-output-005
:at: 4
- Fixes: QK norm, z-loss regularization
:::


(cs336-17-section-044)=
## Chameleon

:::{slide}
:label: cs336-17-044-output-001
:at: 0
Summary:
:::

:::{slide}
:label: cs336-17-044-output-002
:at: 1
- Elegant (just autoregressive modeling of discrete tokens)
:::

:::{slide}
:label: cs336-17-044-output-003
:at: 2
- Not as performant (discretization loses information - think OCR)
:::

:::{slide}
:label: cs336-17-044-output-004
:at: 3
- Training with multiple modalities is tricky
:::

:::{slide}
:label: cs336-17-044-output-005
:at: 4
Summary:
:::


(cs336-17-section-045)=
## Chameleon

:::{slide}
:label: cs336-17-045-output-001
:at: 0
- Frontier models are expected to be multimodal (natively multimodal, omni)
:::

:::{slide}
:label: cs336-17-045-output-002
:at: 1
- Fundamental challenge: how to encode non-text modalities?
:::

:::{slide}
:label: cs336-17-045-output-003
:at: 2
- Comprehension and generation might demand different things (semantics versus finer-grained details)
:::

:::{slide}
:label: cs336-17-045-output-004
:at: 3
- Balance images + video (lower information density) and text for training stability
:::

:::{slide}
:label: cs336-17-045-output-005
:at: 4
- Continuous encoders + Transformer + diffusion models for generation
:::

