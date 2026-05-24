type Props = {
  driftMins: number
  onConfirm: () => void
  onDismiss: () => void
}

export default function ConfirmReplan({ driftMins, onConfirm, onDismiss }: Props) {
  return (
    <div
      className="mx-4 mb-3 p-3 rounded-xl"
      style={{
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
      }}
    >
      <p className="text-sm font-medium" style={{ color: '#D97706' }}>Adjust your plan?</p>
      <p className="text-xs mt-1" style={{ color: '#B45309' }}>
        You lost ~{driftMins} minutes. Should Kepler reschedule the rest of your day?
      </p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onConfirm}
          id="confirm-replan"
          className="text-xs text-white rounded-lg px-4 py-1.5 cursor-pointer transition-colors"
          style={{ background: '#92400E' }}
        >
          Yes, reschedule
        </button>
        <button
          onClick={onDismiss}
          id="dismiss-replan"
          className="text-xs rounded-lg px-4 py-1.5 cursor-pointer transition-colors"
          style={{ color: '#B45309', border: '1px solid rgba(245, 158, 11, 0.3)' }}
        >
          No, keep plan
        </button>
      </div>
    </div>
  )
}
