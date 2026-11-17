"use client";

import { Modal } from "@/components/ui/Modal";
import type { TradeFlow, TradePhase } from "./useTradeFlow";
import { FailedStep, PendingStep, ReviewStep, SuccessStep } from "./TradeModalSteps";

interface TradeModalProps {
  flow: TradeFlow;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
}

const TITLES: Record<TradePhase, string> = {
  review: "Review transaction",
  pending: "Confirm transaction",
  success: "Transaction complete",
  failed: "Transaction failed",
};

export function TradeModal({ flow, onConfirm, onCancel, onClose }: TradeModalProps) {
  const { request, phase } = flow;

  return (
    <Modal open={flow.open} onClose={onClose} title={TITLES[phase]} dismissible={phase !== "pending"}>
      {request && phase === "review" && <ReviewStep request={request} onConfirm={onConfirm} onClose={onClose} />}
      {request && phase === "pending" && <PendingStep request={request} stepIndex={flow.stepIndex} onCancel={onCancel} />}
      {request && phase === "success" && flow.receipt && <SuccessStep request={request} receipt={flow.receipt} onClose={onClose} />}
      {request && phase === "failed" && flow.failure && <FailedStep failure={flow.failure} onRetry={onConfirm} onClose={onClose} />}
    </Modal>
  );
}
