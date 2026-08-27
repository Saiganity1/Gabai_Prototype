import React, { useState } from 'react'
import {
  Users, Shield, CheckCircle, Clock,
  X, Send, PhoneCall, Plus, Zap, BatteryCharging, Radio
} from 'lucide-react'

interface FamilyMember {
  id: string
  name: string
  relation: string
  status: 'safe' | 'pending' | 'evacuating'
  location: string
  lastSeen: string
  battery: string
}

interface Props {
  currentLocationName: string
  onClose: () => void
  onTriggerSOSStrobe: () => void
}

export default function FamilySafetyModal({ currentLocationName, onClose, onTriggerSOSStrobe }: Props) {
  const [family, setFamily] = useState<FamilyMember[]>([
    {
      id: 'fam-1',
      name: 'Elena Santos',
      relation: 'Mother',
      status: 'safe',
      location: 'Central Evacuation Gym',
      lastSeen: '10 mins ago',
      battery: '82%',
    },
    {
      id: 'fam-2',
      name: 'Marco Santos',
      relation: 'Brother',
      status: 'safe',
      location: 'Home (2nd Floor)',
      lastSeen: '18 mins ago',
      battery: '64%',
    },
    {
      id: 'fam-3',
      name: 'Lola Teresa',
      relation: 'Grandmother',
      status: 'pending',
      location: 'Sta. Cruz Sector',
      lastSeen: '45 mins ago',
      battery: '38%',
    },
  ])

  const [hasBroadcastedSafe, setHasBroadcastedSafe] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactRelation, setNewContactRelation] = useState('')

  const handleBroadcastSafe = () => {
    setHasBroadcastedSafe(true)
    setTimeout(() => setHasBroadcastedSafe(false), 5000)
  }

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newContactName) return
    const newMember: FamilyMember = {
      id: `fam-${Date.now()}`,
      name: newContactName,
      relation: newContactRelation || 'Family',
      status: 'safe',
      location: 'Nearby Sector',
      lastSeen: 'Just now',
      battery: '90%',
    }
    setFamily([...family, newMember])
    setNewContactName('')
    setNewContactRelation('')
    setShowAddContact(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 anim-fade-in select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl text-white anim-slide-up flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">Family Safety Circle</h3>
              <p className="text-xs text-slate-400">Real-time disaster check-in & SOS alerts</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1-Tap "I Am Safe" Broadcast Banner */}
        <div className="bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-500/40 rounded-2xl p-3.5 mb-4 flex items-center justify-between gap-3 shadow-lg">
          <div>
            <div className="font-extrabold text-emerald-300 text-xs flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>Broadcast Safety Status</span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Sends GPS ({currentLocationName.split(',')[0]}) & battery level to family
            </p>
          </div>
          <button
            onClick={handleBroadcastSafe}
            disabled={hasBroadcastedSafe}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-md flex items-center gap-1.5 shrink-0 transition-all active:scale-95 disabled:opacity-50"
          >
            {hasBroadcastedSafe ? <CheckCircle className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            <span>{hasBroadcastedSafe ? 'Broadcasted!' : "I'm Safe"}</span>
          </button>
        </div>

        {/* Family Member List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 mb-4 pr-1">
          {family.map((member) => (
            <div
              key={member.id}
              className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-sm text-slate-200">
                  {member.name.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-xs text-white flex items-center gap-1.5">
                    <span>{member.name}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({member.relation})</span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <span>{member.location}</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <BatteryCharging className="w-3 h-3 text-emerald-400" /> {member.battery}
                    </span>
                  </div>
                </div>
              </div>

              <span
                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  member.status === 'safe'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : member.status === 'pending'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
              >
                {member.status}
              </span>
            </div>
          ))}

          {/* Add Contact Form */}
          {showAddContact ? (
            <form onSubmit={handleAddContact} className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2">
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="Family member's name..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={newContactRelation}
                onChange={(e) => setNewContactRelation(e.target.value)}
                placeholder="Relation (e.g. Sister, Father)..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddContact(false)}
                  className="flex-1 bg-slate-800 text-xs text-slate-300 py-1.5 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white py-1.5 rounded-xl"
                >
                  Save Member
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddContact(true)}
              className="w-full py-2.5 rounded-2xl border border-dashed border-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Family Member</span>
            </button>
          )}
        </div>

        {/* SOS Night Strobe Rescue Launcher */}
        <div className="pt-3 border-t border-slate-800 flex gap-2">
          <button
            onClick={() => {
              onClose()
              onTriggerSOSStrobe()
            }}
            className="flex-1 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-xs py-3 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>Launch Night Rescue SOS Strobe</span>
          </button>
        </div>
      </div>
    </div>
  )
}
