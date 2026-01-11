---
layout: default
title: "Salience-Gated Aggregation + Log-Domain Arithmetic (Thought Experiment)"
---

<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

## Overview
I am a third-year B.Tech student thinking aloud about a salience-gated aggregation scheme that uses a competitive (tournament) selector plus Logarithmic Computation Domain (LCD) and Logarithmic Number System (LNS) arithmetic. The aim is to avoid dense summation when scoring tokens and to consider whether log-domain compute could lower energy in the right hardware context. This is a thought experiment, not a claim of superiority. The sections below outline motivation, definitions, complexity, and modest experiments that could falsify the idea.

## Motivation: Why Dense Summation Feels Wasteful
Dense attention sums over all token interactions even when many contributions are near-duplicate or negligible. If most attention mass comes from a few salient tokens, expending multiply-accumulate work across the whole row feels wasteful. Similarly, dense projections mix every dimension whether or not it is useful for the current token. The intuition is to use competitive selection so only salient signals survive, and to combine that with log-domain arithmetic to avoid repeated floating-point multiplication when it is not needed.

## Baseline: What a Standard Transformer Layer Computes
- Dense projections (queries, keys, values, feed-forward networks) apply matrix multiplies of shape \(n \times d\) by \(d \times d\), costing \(O(n d^2)\).
- Attention mixing forms \(QK^\top\) of size \(n \times n\) and applies softmax and value-weighted sums, costing \(O(n^2 d)\).
- People often summarize Transformers as \(O(n^2)\) because, at long context, the \(n^2 d\) term from attention dominates the \(n d^2\) term from projections.

## Proposed Idea: Salience-Gated Aggregation
Consider positive scores \(s_i > 0\) and associated vectors \(v_i\). Use pairwise tournaments:
- Pair two candidates \((s_a, v_a)\) and \((s_b, v_b)\).
- Use a ratio threshold \(\tau > 0\) and stability \(\epsilon > 0\).
- Keep \(a\) if \(s_a \ge (1 + \tau) s_b + \epsilon\); keep \(b\) if \(s_b \ge (1 + \tau) s_a + \epsilon\).
- If neither dominates, treat them as equivalent and keep one representative (order dependence is a risk; see bootstrapping).
- Optional normalization step can rescale the kept score to \(\max(s_a, s_b)\) or an average; the choice affects bias.

One clean definition for a winner function:
\[
\operatorname{win}(a, b) = \begin{cases}
a & s_a \ge (1 + \tau) s_b + \epsilon \\
b & s_b \ge (1 + \tau) s_a + \epsilon \\
\text{tie} & \text{otherwise}
\end{cases}
\]
Ties preserve one representative but should be marked as low-confidence because the result depends on ordering.

Bootstrapping to reduce order dependence:
- Run \(B\) tournaments with random pairings.
- Track how often each candidate wins; the empirical win rate becomes a confidence score \(\gamma_i \in [0, 1]\).
- Allow a “no-winner” outcome if neither candidate clears the threshold; this keeps the model from overconfidently collapsing near-equal paraphrases.

Pseudocode sketches:

```pseudo
function TournamentReduce(scores, values, tau, epsilon):
    # scores must be positive; values can be vectors
    candidates = zip(scores, values)
    shuffle(candidates)  # any ordering risk is addressed by bootstraps
    winners = []
    while candidates not empty:
        (sa, va) = pop(candidates)
        if candidates empty:
            winners.append((sa, va, "low_conf"))
            break
        (sb, vb) = pop(candidates)
        if sa >= (1 + tau) * sb + epsilon:
            winners.append((sa, va, "winner"))
        elif sb >= (1 + tau) * sa + epsilon:
            winners.append((sb, vb, "winner"))
        else:
            if sa >= sb:
                winners.append((sa, va, "tie"))  # tie, keep higher score
            else:
                winners.append((sb, vb, "tie"))
    return winners
```

```pseudo
function BootstrapSalience(scores, values, B, gamma):
    # gamma bundles thresholds: gamma.tau, gamma.epsilon
    win_counts = zeros_like(scores)  # track wins per original index
    for b in 1..B:
        winners = TournamentReduce(scores, values,
                                   tau=gamma.tau,
                                   epsilon=gamma.epsilon)
        for (s, v, tag) in winners:
            idx = index_of_original(values, v)
            if tag == "winner":
                win_counts[idx] += 1
    confidences = win_counts / B  # empirical win rates
    return confidences
```

## Adding Log-Domain Arithmetic (LCD/LNS Intuition)
- In log space, multiplication becomes addition: \(\log(ab) = \log a + \log b\).
- Summation in log space normally uses the log-sum-exp trick: \(\log(\sum_i e^{x_i})\).
- This thought experiment intentionally avoids summation by using competitive selection; only the winner’s log score is propagated, so no log-sum-exp is required.
- This shifts behavior toward a competitive or tropical-like regime: large signals dominate, small ones vanish. It alters the function class and may drop nuance.

## Complexity Comparison
- Standard Transformer per layer: \(O(n^2 d + n d^2)\), with \(n^2 d\) from attention mixing and \(n d^2\) from projections and feed-forward blocks.
- Proposed model per layer: \(O(n d^2 + B n^2)\) if projections stay dense and attention is replaced by \(B\) bootstrapped tournaments (each tournament is \(O(n^2)\) pairing cost).
- The \(B n^2\) term comes from repeated competitive pairings; reducing \(n d^2\) further would require sparsity, low-rank factors, mixture-of-experts routing, or structured pruning.
- If \(B\) is small and salient tokens are few, the hope is lower constant factors, but asymptotics remain quadratic in \(n\).

## Energy Intuition (Without Overclaiming)
- Energy is not the same as Big-O. Memory access, data movement, and cache behavior often dominate arithmetic cost.
- GPUs and many accelerators are optimized for dense matrix multiplication; sparse or irregular tournaments may underutilize cores.
- Log-domain arithmetic can reduce multiply cost, but benefits depend on hardware support (e.g., LNS pipelines, fused adders) and dataflow that limits memory traffic.
- Without hardware co-design or structured sparsity, the energy benefit may be negligible or negative due to control-flow overhead.

## Where This Might Work
- Inputs with high redundancy where many tokens are paraphrastic or templated, so salience filtering removes duplicates.
- Retrieval-augmented setups where only a few retrieved chunks matter and the rest should be ignored quickly.
- Edge or low-power accelerators that already favor log-domain or approximate arithmetic and can exploit structured sparsity.

## Where This Will Probably Fail
- Tasks needing fine-grained interpolation of many small signals (e.g., arithmetic reasoning, tight copy tasks).
- Situations where order dependence in tournaments introduces bias and no amount of bootstrapping fixes it.
- Long-range dependencies that require consistent weighting across many tokens; a hard winner-takes-most may be too brittle.
- Hardware that expects dense GEMM; irregular pairing could waste throughput and add latency.

## Minimal Experiments to Test the Hypothesis
- Toy attention replacement  
  - Goal: Compare dense softmax attention vs tournament selection on a synthetic copy-or-select task.  
  - Setup: Sequence of one salient token plus distractors; measure retrieval of the salient value.  
  - Metric: Accuracy of selecting the correct token; wall-clock time if possible.  
  - Expected: Similar accuracy at small \(B\) if salience is clear; slight speedup only if implementation is efficient.  
  - Falsifier: Accuracy drops sharply or runtime grows due to irregular control flow.
- Paraphrase-style redundancy  
  - Goal: Check whether tournaments collapse paraphrases similarly to softmax.  
  - Setup: Tokens contain repeated paraphrases with minor perturbations.  
  - Metric: Variance of selected token identity; semantic similarity of chosen representation.  
  - Expected: Low variance when paraphrases are near-equal; one representative survives.  
  - Falsifier: High variance or consistent loss of important variants.
- Stability vs bootstraps  
  - Goal: See how increasing \(B\) affects stability and accuracy.  
  - Setup: Same synthetic task; vary \(B \in \{1, 2, 4, 8\}\).  
  - Metric: Accuracy and variance across seeds.  
  - Expected: Accuracy and stability improve then saturate; beyond a point, returns diminish.  
  - Falsifier: No stability gain or accuracy degradation as \(B\) grows (suggesting overfitting to noise).

## Notes on Related Work (Short)
- Arnold & Chester et al., 2020: Approximate tableless training for LNS to avoid large lookup tables. Inspired the feasibility of training with log-domain primitives.
- Miyashita et al., 2016: Convolutional Neural Networks with logarithmic representation to cut multiply cost; shows accuracy can survive log quantization.
- Zhao et al., 2022 (LNS-Madam): Log-domain training method with adaptive momentum; demonstrates optimizer compatibility with LNS.
- Haghi et al., 2024: Large Language Models with LNS dynamic formats and architecture co-design; argues for joint hardware-model tuning.
- Kosheleva et al., 2024: Theoretical arguments for LNS optimality under certain noise models; provides motivation for log-domain efficiency.

## Conclusion
Salience-gated tournaments plus log-domain arithmetic are an attempt to make “pay only for salient interactions” precise. The approach keeps quadratic attention complexity but may shift constants and energy use if paired with the right sparsity and hardware. It also changes the model class toward competitive selection, which can drop nuance.

Personal note: This is a thought experiment from a student who is trying to learn by writing. I am not claiming superiority over Transformers, just exploring a direction that could be wrong. Feedback, especially critical feedback, is very welcome
