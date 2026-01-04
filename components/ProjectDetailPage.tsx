'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Project, Track, ProjectMetrics, ProjectNote, TrackNote } from '@/lib/types'
import TrackPlaylist from './TrackPlaylist'
import { Copy, Share2, Eye, Download, Plus, Edit, ArrowLeft, FileText, Save, X, Upload, Trash2, MoreVertical, Pin, PinOff, ListMusic } from 'lucide-react'
import { showToast } from './Toast'
import Image from 'next/image'
import { ProjectDetailSkeleton } from './SkeletonLoader'
import ShareModal from './ShareModal'
import { addToQueue } from './BottomTabBar'

interface ProjectDetailPageProps {
  projectId: string
}

export default function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const { user, logout } = usePrivy()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [isCreator, setIsCreator] = useState(false)
  const [projectNote, setProjectNote] = useState<ProjectNote | null>(null)
  const [projectNoteContent, setProjectNoteContent] = useState('')
  const [editingProjectNote, setEditingProjectNote] = useState(false)
  const [trackNotes, setTrackNotes] = useState<Record<string, TrackNote>>({})
  const [editingTrackNotes, setEditingTrackNotes] = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)
  const [creatorUsername, setCreatorUsername] = useState<string | null>(null)
  const [newTracks, setNewTracks] = useState<Array<{ file: File | null; title: string; image?: File; imagePreview?: string }>>([])
  const [addingTracks, setAddingTracks] = useState(false)
  const [showAddTrackForm, setShowAddTrackForm] = useState(false)
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const [editingProject, setEditingProject] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCoverImage, setEditCoverImage] = useState<File | null>(null)
  const [editCoverImagePreview, setEditCoverImagePreview] = useState<string | null>(null)
  const [savingProject, setSavingProject] = useState(false)
  const [editingTracks, setEditingTracks] = useState<Record<string, { title: string; image?: File; imagePreview?: string }>>({})
  const [savingTracks, setSavingTracks] = useState<Record<string, boolean>>({})
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null) // Track currently being edited in modal
  const [editingTrackTitle, setEditingTrackTitle] = useState('') // Title being edited
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [trackMenuOpen, setTrackMenuOpen] = useState(false) // Track when child menu is open

  // Detect mobile vs desktop
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    loadProject()
  }, [projectId])

  // Close project menu when clicking outside (desktop only)
  useEffect(() => {
    if (typeof window === 'undefined' || !isProjectMenuOpen) return
    
    const handleClickOutside = (event: MouseEvent) => {
      // Only handle click outside on desktop (sm and up)
      if (window.innerWidth >= 640) {
        const target = event.target as Node
        // Don't close if clicking the button that opens the menu
        const menuButton = projectMenuRef.current?.querySelector('button')
        if (menuButton && menuButton.contains(target)) {
          return
        }
        // Close if clicking outside the menu
        if (projectMenuRef.current && !projectMenuRef.current.contains(target)) {
          setIsProjectMenuOpen(false)
        }
      }
    }

    // Add listener with a small delay to avoid immediate closure
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 50)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [isProjectMenuOpen])

  const loadProject = async () => {
    try {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError) throw projectError
      setProject(projectData)
      
      // Set pinned state for creator's own projects
      if (projectData.pinned) {
        setIsPinned(projectData.pinned)
      }

      // Fetch creator's username
      if (projectData.creator_id) {
        const { data: creatorData } = await supabase
          .from('users')
          .select('username, email')
          .eq('id', projectData.creator_id)
          .single()
        
        if (creatorData) {
          setCreatorUsername(creatorData.username || creatorData.email || null)
        }
      }

      const { data: tracksData, error: tracksError } = await supabase
        .from('tracks')
        .select('*')
        .eq('project_id', projectId)
        .order('order', { ascending: true })

      if (tracksError) throw tracksError
      setTracks(tracksData || [])

      const { data: metricsData } = await supabase
        .from('project_metrics')
        .select('*')
        .eq('project_id', projectId)
        .single()

      setMetrics(metricsData)

      // Check if current user is the creator and load notes if so
      if (user) {
        const privyId = user.id
        const { data: dbUser } = await supabase
          .from('users')
          .select('id')
          .eq('privy_id', privyId)
          .single()

        if (dbUser && dbUser.id === projectData.creator_id) {
          setIsCreator(true)

          // Load project note
          const { data: projectNoteData } = await supabase
            .from('project_notes')
            .select('*')
            .eq('project_id', projectId)
            .single()

          if (projectNoteData) {
            setProjectNote(projectNoteData)
            setProjectNoteContent(projectNoteData.content)
          }

          // Load track notes
          if (tracksData && tracksData.length > 0) {
            const trackIds = tracksData.map(t => t.id)
            const { data: trackNotesData } = await supabase
              .from('track_notes')
              .select('*')
              .in('track_id', trackIds)

            if (trackNotesData) {
              const notesMap: Record<string, TrackNote> = {}
              const editingMap: Record<string, string> = {}
              trackNotesData.forEach(note => {
                notesMap[note.track_id] = note
                editingMap[note.track_id] = note.content
              })
              setTrackNotes(notesMap)
              setEditingTrackNotes(editingMap)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading project:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenShareModal = () => {
    if (!project) return
    
    // Check if sharing is enabled (default to true if not set)
    if (project.sharing_enabled === false) {
      showToast('Sharing is disabled for this project. Enable it in Project Settings.', 'error')
      setIsProjectMenuOpen(false)
      return
    }
    
    setShareModalOpen(true)
    setIsProjectMenuOpen(false)
    
    // Track share when modal is opened
    trackShare()
  }

  const handleCloseShareModal = () => {
    setShareModalOpen(false)
  }


  const trackShare = async () => {
    if (!project) return
    
    try {
      // Get user ID if authenticated
      let userId: string | null = null
      if (user) {
        const privyId = user.id
        const { data: dbUser } = await supabase
          .from('users')
          .select('id')
          .eq('privy_id', privyId)
          .single()
        userId = dbUser?.id || null
      }

      // Insert share record with user_id
      const { error: shareError } = await supabase
        .from('project_shares')
        .insert({ 
          project_id: project.id,
          user_id: userId
        })

      if (shareError) {
        console.error('Error inserting share:', shareError)
      }

      // Update metrics
      const { data: metricsData, error: metricsError } = await supabase
        .from('project_metrics')
        .select('shares')
        .eq('project_id', project.id)
        .single()

      if (metricsError && metricsError.code !== 'PGRST116') {
        console.error('Error fetching metrics:', metricsError)
      }

      if (metricsData) {
        const currentShares = metricsData.shares ?? 0
        const { error: updateError } = await supabase
          .from('project_metrics')
          .update({ shares: currentShares + 1 })
          .eq('project_id', project.id)
        
        if (updateError) {
          console.error('Error updating shares:', updateError)
          console.error('Update error details:', JSON.stringify(updateError, null, 2))
        } else {
          // Reload metrics
          const { data: updatedMetrics, error: reloadError } = await supabase
            .from('project_metrics')
            .select('*')
            .eq('project_id', project.id)
            .single()
          if (reloadError) {
            console.error('Error reloading metrics:', reloadError)
          } else if (updatedMetrics) {
            setMetrics(updatedMetrics)
          }
        }
      } else {
        const { error: insertError } = await supabase
          .from('project_metrics')
          .insert({ project_id: project.id, shares: 1, plays: 0, adds: 0 })
        
        if (insertError) {
          console.error('Error creating metrics:', insertError)
          console.error('Insert error details:', JSON.stringify(insertError, null, 2))
        } else {
          // Reload metrics
          const { data: newMetrics, error: reloadError } = await supabase
            .from('project_metrics')
            .select('*')
            .eq('project_id', project.id)
            .single()
          if (reloadError) {
            console.error('Error reloading new metrics:', reloadError)
          } else if (newMetrics) {
            setMetrics(newMetrics)
          }
        }
      }
    } catch (error) {
      console.error('Error tracking share:', error)
    }
  }

  const handleAddToQueue = async () => {
    if (!user || !project) return
    try {
      const privyId = user.id
      let { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (!dbUser) {
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({ privy_id: privyId, email: user.email?.address || null })
          .select('id')
          .single()
        if (userError || !newUser) throw userError || new Error('Failed to create user')
        dbUser = newUser
      }

      // Check if already added
      const { data: existingEntry } = await supabase
        .from('user_projects')
        .select('id')
        .eq('user_id', dbUser.id)
        .eq('project_id', project.id)
        .single()

      if (!existingEntry) {
        // Add to user_projects if not already added
        await supabase
          .from('user_projects')
          .upsert({ user_id: dbUser.id, project_id: project.id }, { onConflict: 'user_id,project_id' })

        // Track add
        const { data: metrics, error: metricsError } = await supabase
          .from('project_metrics')
          .select('adds')
          .eq('project_id', project.id)
          .single()

        if (metricsError && metricsError.code !== 'PGRST116') {
          console.error('Error fetching metrics:', metricsError)
        }

        if (metrics) {
          const currentAdds = metrics.adds ?? 0
          const { error: updateError } = await supabase
            .from('project_metrics')
            .update({ adds: currentAdds + 1 })
            .eq('project_id', project.id)
          
          if (updateError) {
            console.error('Error updating adds:', updateError)
            console.error('Update error details:', JSON.stringify(updateError, null, 2))
          } else {
            // Reload metrics to show updated count
            const { data: updatedMetrics, error: reloadError } = await supabase
              .from('project_metrics')
              .select('*')
              .eq('project_id', project.id)
              .single()
            if (reloadError) {
              console.error('Error reloading metrics:', reloadError)
            } else if (updatedMetrics) {
              setMetrics(updatedMetrics)
            }
          }
        } else {
          const { error: insertError } = await supabase
            .from('project_metrics')
            .insert({ project_id: project.id, adds: 1, plays: 0, shares: 0 })
          
          if (insertError) {
            console.error('Error creating metrics:', insertError)
            console.error('Insert error details:', JSON.stringify(insertError, null, 2))
          } else {
            // Reload metrics
            const { data: newMetrics, error: reloadError } = await supabase
              .from('project_metrics')
              .select('*')
              .eq('project_id', project.id)
              .single()
            if (reloadError) {
              console.error('Error reloading new metrics:', reloadError)
            } else if (newMetrics) {
              setMetrics(newMetrics)
            }
          }
        }

        // Also add all tracks to local playback queue
        let addedCount = 0
        for (const track of tracks) {
          const added = addToQueue({
            id: track.id,
            title: track.title,
            projectTitle: project.title,
            audioUrl: track.audio_url,
            projectCoverUrl: project.cover_image_url,
          })
          if (added) addedCount++
        }
        
        showToast(`Added ${addedCount} track${addedCount !== 1 ? 's' : ''} to queue!`, 'success')
      } else {
        // Still add to local playback queue even if already in user's collection
        let addedCount = 0
        for (const track of tracks) {
          const added = addToQueue({
            id: track.id,
            title: track.title,
            projectTitle: project.title,
            audioUrl: track.audio_url,
            projectCoverUrl: project.cover_image_url,
          })
          if (added) addedCount++
        }
        
        if (addedCount > 0) {
          showToast(`Added ${addedCount} track${addedCount !== 1 ? 's' : ''} to queue!`, 'success')
        } else {
          showToast('All tracks already in queue', 'info')
        }
      }
      setIsProjectMenuOpen(false)
    } catch (error) {
      console.error('Error adding to queue:', error)
      showToast('Failed to add to queue', 'error')
    }
  }

  const handleTogglePin = async () => {
    if (!user || !project) return
    try {
      const privyId = user.id
      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (!dbUser) return

      const newPinnedState = !isPinned
      
      if (isCreator) {
        // For creator's own projects, update the projects table
        const { error } = await supabase
          .from('projects')
          .update({ pinned: newPinnedState })
          .eq('id', project.id)

        if (error) throw error
      } else {
        // For saved projects, use upsert on user_projects table
        const { error } = await supabase
          .from('user_projects')
          .upsert(
            { user_id: dbUser.id, project_id: project.id, pinned: newPinnedState },
            { onConflict: 'user_id,project_id' }
          )

        if (error) throw error
      }

      setIsPinned(newPinnedState)
      setIsProjectMenuOpen(false)
      showToast(newPinnedState ? 'Project pinned!' : 'Project unpinned', 'success')
    } catch (error) {
      console.error('Error toggling pin:', error)
      showToast('Failed to update pin status', 'error')
    }
  }

  const startEditingProject = () => {
    if (!project) return
    setEditTitle(project.title)
    setEditDescription(project.description || '')
    setEditCoverImagePreview(project.cover_image_url || null)
    setEditCoverImage(null)
    setEditingProject(true)
    setIsProjectMenuOpen(false)
  }

  const cancelEditingProject = () => {
    setEditingProject(false)
    setEditTitle('')
    setEditDescription('')
    setEditCoverImage(null)
    setEditCoverImagePreview(null)
  }

  const handleSaveProject = async () => {
    if (!project || !isCreator) return
    setSavingProject(true)

    try {
      let coverImageUrl = project.cover_image_url

      // Upload new cover image if provided
      if (editCoverImage) {
        const privyId = user?.id
        if (!privyId) throw new Error('User not authenticated')

        let { data: dbUser } = await supabase
          .from('users')
          .select('id')
          .eq('privy_id', privyId)
          .single()

        if (!dbUser) {
          const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert({ privy_id: privyId, email: user?.email?.address || null })
            .select('id')
            .single()
          if (userError || !newUser) throw new Error('Failed to get or create user')
          dbUser = newUser
        }

        coverImageUrl = await uploadFile(editCoverImage, `projects/${dbUser.id}/cover-images`)
      }

      // Update project
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          title: editTitle,
          description: editDescription || null,
          cover_image_url: coverImageUrl || null,
        })
        .eq('id', project.id)

      if (updateError) throw updateError

      showToast('Project updated successfully!', 'success')
      setEditingProject(false)
      await loadProject()
    } catch (error: any) {
      console.error('Error updating project:', error)
      showToast(error?.message || 'Failed to update project. Please try again.', 'error')
    } finally {
      setSavingProject(false)
    }
  }

  const handleEditCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setEditCoverImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setEditCoverImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const startEditingTrack = (track: Track) => {
    console.log('startEditingTrack called with:', track)
    console.log('Setting editingTrackId to:', track.id)
    console.log('Setting editingTrackTitle to:', track.title)
    setEditingTrackId(track.id)
    setEditingTrackTitle(track.title)
  }

  const cancelEditingTrackModal = () => {
    setEditingTrackId(null)
    setEditingTrackTitle('')
  }

  const saveEditingTrack = async () => {
    if (!editingTrackId || !editingTrackTitle.trim()) return
    
    const track = tracks.find(t => t.id === editingTrackId)
    if (!track) return

    setSavingTracks({ ...savingTracks, [editingTrackId]: true })

    try {
      const { error: updateError } = await supabase
        .from('tracks')
        .update({ title: editingTrackTitle.trim() })
        .eq('id', editingTrackId)

      if (updateError) throw updateError

      showToast('Track updated successfully!', 'success')
      cancelEditingTrackModal()
      await loadProject()
    } catch (error: any) {
      console.error('Error updating track:', error)
      showToast(error?.message || 'Failed to update track. Please try again.', 'error')
    } finally {
      setSavingTracks({ ...savingTracks, [editingTrackId]: false })
    }
  }

  const cancelEditingTrack = (trackId: string) => {
    const newEditingTracks = { ...editingTracks }
    delete newEditingTracks[trackId]
    setEditingTracks(newEditingTracks)
  }

  const handleSaveTrack = async (track: Track) => {
    if (!project || !isCreator) return
    setSavingTracks({ ...savingTracks, [track.id]: true })

    try {
      let trackImageUrl = track.image_url

      // Upload new track image if provided
      const editData = editingTracks[track.id]
      if (editData?.image) {
        const privyId = user?.id
        if (!privyId) throw new Error('User not authenticated')

        let { data: dbUser } = await supabase
          .from('users')
          .select('id')
          .eq('privy_id', privyId)
          .single()

        if (!dbUser) {
          const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert({ privy_id: privyId, email: user?.email?.address || null })
            .select('id')
            .single()
          if (userError || !newUser) throw new Error('Failed to get or create user')
          dbUser = newUser
        }

        trackImageUrl = await uploadFile(editData.image, `projects/${dbUser.id}/track-images`)
      }

      // Update track
      const { error: updateError } = await supabase
        .from('tracks')
        .update({
          title: editData?.title || track.title,
          image_url: trackImageUrl || null,
        })
        .eq('id', track.id)

      if (updateError) throw updateError

      showToast('Track updated successfully!', 'success')
      cancelEditingTrack(track.id)
      await loadProject()
    } catch (error: any) {
      console.error('Error updating track:', error)
      showToast(error?.message || 'Failed to update track. Please try again.', 'error')
    } finally {
      setSavingTracks({ ...savingTracks, [track.id]: false })
    }
  }

  const handleTrackImageChange = (trackId: string, file: File) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      setEditingTracks({
        ...editingTracks,
        [trackId]: {
          ...editingTracks[trackId],
          image: file,
          imagePreview: reader.result as string,
        },
      })
    }
    reader.readAsDataURL(file)
  }

  const handleDeleteProject = async () => {
    if (!project || !isCreator) return
    setIsProjectMenuOpen(false)

    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return
    }

    try {
      // Delete the project (cascade will handle tracks, notes, etc.)
      const { data: deleteData, error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id)
        .select()

      if (deleteError) {
        console.error('Delete error:', deleteError)
        throw deleteError
      }

      if (!deleteData || deleteData.length === 0) {
        throw new Error('Project was not deleted. It may not exist or you may not have permission.')
      }

      showToast('Project deleted successfully!', 'success')
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Error deleting project:', error)
      const errorMessage = error?.message || 'Failed to delete project. Please try again.'
      showToast(`Error: ${errorMessage}`, 'error')
    }
  }

  const handleSaveProjectNote = async () => {
    if (!project) return
    setSavingNote('project')

    try {
      if (projectNote) {
        // Update existing note
        const { data, error } = await supabase
          .from('project_notes')
          .update({ content: projectNoteContent })
          .eq('id', projectNote.id)
          .select()
          .single()

        if (error) throw error
        setProjectNote(data)
      } else {
        // Create new note
        const { data, error } = await supabase
          .from('project_notes')
          .insert({ project_id: project.id, content: projectNoteContent })
          .select()
          .single()

        if (error) throw error
        setProjectNote(data)
      }
      setEditingProjectNote(false)
    } catch (error) {
      console.error('Error saving project note:', error)
        showToast('Failed to save note', 'error')
    } finally {
      setSavingNote(null)
    }
  }

  const handleSaveTrackNote = async (trackId: string) => {
    setSavingNote(trackId)

    try {
      const content = editingTrackNotes[trackId] || ''

      if (trackNotes[trackId]) {
        // Update existing note
        const { data, error } = await supabase
          .from('track_notes')
          .update({ content })
          .eq('id', trackNotes[trackId].id)
          .select()
          .single()

        if (error) throw error
        setTrackNotes({ ...trackNotes, [trackId]: data })
      } else {
        // Create new note
        const { data, error } = await supabase
          .from('track_notes')
          .insert({ track_id: trackId, content })
          .select()
          .single()

        if (error) throw error
        setTrackNotes({ ...trackNotes, [trackId]: data })
      }

      // Exit edit mode by removing from editingTrackNotes
      const newEditing = { ...editingTrackNotes }
      delete newEditing[trackId]
      setEditingTrackNotes(newEditing)
      
      showToast('Note saved!', 'success')
    } catch (error) {
      console.error('Error saving track note:', error)
      showToast('Failed to save note', 'error')
    } finally {
      setSavingNote(null)
    }
  }

  const startEditingTrackNote = (trackId: string) => {
    const currentNote = trackNotes[trackId]
    setEditingTrackNotes({
      ...editingTrackNotes,
      [trackId]: currentNote?.content || ''
    })
  }

  const sanitizeFileName = (fileName: string): string => {
    // Remove or replace invalid characters for storage paths
    // Replace colons, commas, and other problematic characters with underscores
    return fileName
      .replace(/[:,\/\\?*|"<>]/g, '_') // Replace invalid characters with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
  }

  const uploadFile = async (file: File, path: string): Promise<string> => {
    if (!user) throw new Error('User not authenticated')
    
    const privyId = user.id
    
    // Get or create user
    let { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', privyId)
      .single()

    if (userError || !dbUser) {
      // Try to create user if doesn't exist
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          privy_id: privyId,
          email: user.email?.address || null,
        })
        .select('id')
        .single()

      if (createError || !newUser) {
        throw new Error(createError?.message || 'Failed to get or create user')
      }
      dbUser = newUser
    }

    if (!dbUser) throw new Error('User not found')

    // Sanitize the filename
    const sanitizedName = sanitizeFileName(file.name)
    const timestamp = Date.now()
    const uploadPath = `${path}/${timestamp}-${sanitizedName}`

    const { data, error } = await supabase.storage
      .from('hubba-files')
      .upload(uploadPath, file)

    if (error) {
      console.error('Storage upload error:', error)
      throw new Error(`Failed to upload file: ${error.message}`)
    }

    if (!data) {
      throw new Error('Upload succeeded but no data returned')
    }

    const { data: { publicUrl } } = supabase.storage
      .from('hubba-files')
      .getPublicUrl(data.path)

    return publicUrl
  }

  const handleAddNewTrack = () => {
    setNewTracks([...newTracks, { file: null, title: '' }])
    setShowAddTrackForm(true)
  }

  const handleNewTrackFileChange = (index: number, file: File) => {
    const updatedTracks = [...newTracks]
    updatedTracks[index].file = file
    if (!updatedTracks[index].title) {
      const name = file.name.replace(/\.[^/.]+$/, '')
      updatedTracks[index].title = name
    }
    setNewTracks(updatedTracks)
  }

  const handleNewTrackImageChange = (index: number, file: File) => {
    const updatedTracks = [...newTracks]
    updatedTracks[index].image = file
    const reader = new FileReader()
    reader.onloadend = () => {
      updatedTracks[index].imagePreview = reader.result as string
      setNewTracks(updatedTracks)
    }
    reader.readAsDataURL(file)
  }

  const removeNewTrack = (index: number) => {
    setNewTracks(newTracks.filter((_, i) => i !== index))
    if (newTracks.length === 1) {
      setShowAddTrackForm(false)
    }
  }

  const handleDeleteTrack = async (trackId: string) => {
    if (!project || !isCreator) return
    
    if (!confirm('Are you sure you want to delete this track? This action cannot be undone.')) {
      return
    }

    try {
      // First, delete associated track notes (if any)
      const { error: notesDeleteError } = await supabase
        .from('track_notes')
        .delete()
        .eq('track_id', trackId)

      if (notesDeleteError) {
        console.warn('Warning: Could not delete track notes:', notesDeleteError)
        // Continue anyway - notes might not exist or might be handled by CASCADE
      }

      // Delete track plays (if any)
      const { error: playsDeleteError } = await supabase
        .from('track_plays')
        .delete()
        .eq('track_id', trackId)

      if (playsDeleteError) {
        console.warn('Warning: Could not delete track plays:', playsDeleteError)
        // Continue anyway
      }

      // Verify the track belongs to this project before deleting
      const { data: trackData, error: trackCheckError } = await supabase
        .from('tracks')
        .select('id, project_id')
        .eq('id', trackId)
        .eq('project_id', project.id)
        .single()

      if (trackCheckError || !trackData) {
        throw new Error('Track not found or does not belong to this project.')
      }

      // Delete the track
      const { data: deleteData, error: deleteError } = await supabase
        .from('tracks')
        .delete()
        .eq('id', trackId)
        .select()

      if (deleteError) {
        console.error('Delete error:', deleteError)
        throw deleteError
      }

      if (!deleteData || deleteData.length === 0) {
        throw new Error('Track was not deleted. It may not exist or you may not have permission.')
      }

      // Reload the entire project to ensure everything is in sync
      await loadProject()

      showToast('Track deleted successfully!', 'success')
    } catch (error: any) {
      console.error('Error deleting track:', error)
      const errorMessage = error?.message || 'Failed to delete track. Please try again.'
      showToast(`Error: ${errorMessage}`, 'error')
    }
  }

  const handleSaveNewTracks = async () => {
    if (!project || !user || newTracks.length === 0) return

    setAddingTracks(true)
    try {
      const privyId = user.id
      
      // Get or create user
      let { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyId)
        .single()

      if (!dbUser) {
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({
            privy_id: privyId,
            email: user.email?.address || null,
          })
          .select('id')
          .single()

        if (userError || !newUser) {
          throw new Error(userError?.message || 'Failed to create user')
        }
        dbUser = newUser
      }

      if (!dbUser) throw new Error('User not found')

      // Get current max order
      const { data: existingTracks, error: orderError } = await supabase
        .from('tracks')
        .select('order')
        .eq('project_id', project.id)
        .order('order', { ascending: false })
        .limit(1)

      if (orderError) {
        console.error('Error fetching existing tracks:', orderError)
      }

      let nextOrder = 0
      if (existingTracks && existingTracks.length > 0 && existingTracks[0].order !== null) {
        nextOrder = existingTracks[0].order + 1
      }

      // Upload and save each new track
      for (let i = 0; i < newTracks.length; i++) {
        const track = newTracks[i]
        if (!track.file) {
          console.warn(`Skipping track ${i + 1}: no file provided`)
          continue
        }

        if (!track.title || track.title.trim() === '') {
          throw new Error(`Track ${i + 1} must have a title`)
        }

        const audioUrl = await uploadFile(track.file, `projects/${dbUser.id}/tracks`)
        let trackImageUrl: string | undefined
        if (track.image) {
          trackImageUrl = await uploadFile(track.image, `projects/${dbUser.id}/track-images`)
        }

        const { error: trackError } = await supabase
          .from('tracks')
          .insert({
            project_id: project.id,
            title: track.title.trim(),
            audio_url: audioUrl,
            image_url: trackImageUrl || null,
            order: nextOrder + i,
          })

        if (trackError) {
          console.error('Error inserting track:', trackError)
          throw new Error(`Failed to save track "${track.title}": ${trackError.message}`)
        }
      }

      // Reload project data
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError) throw projectError
      setProject(projectData)

      // Reload tracks
      const { data: tracksData, error: tracksError } = await supabase
        .from('tracks')
        .select('*')
        .eq('project_id', projectId)
        .order('order', { ascending: true })

      if (tracksError) throw tracksError
      setTracks(tracksData || [])
      
      // Reset form
      setNewTracks([])
      setShowAddTrackForm(false)
    } catch (error: any) {
      console.error('Error adding tracks:', error)
      const errorMessage = error?.message || 'Failed to add tracks. Please try again.'
      showToast(errorMessage, 'error')
    } finally {
      setAddingTracks(false)
    }
  }

  if (loading) {
    return <ProjectDetailSkeleton />
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Project Not Found</h1>
          <Link href="/dashboard" className="text-neon-green hover:opacity-80">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${project.share_token}`

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/dashboard" className="flex items-center gap-2 text-neon-green hover:opacity-80 opacity-70">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <button
            onClick={logout}
            className="text-sm text-white bg-gray-800 px-4 py-2 rounded-lg hover:bg-gray-700 transition"
          >
            Sign out
          </button>
          <Link href="/" className="text-2xl font-bold">
            Hubba
          </Link>
        </div>
      </nav>

      <main className="px-4 py-8 max-w-4xl mx-auto">
        {/* Cover Image */}
        {!editingProject && project.cover_image_url && (
          <div className="w-full h-40 md:h-56 rounded-lg overflow-hidden mb-6 relative">
            <Image
              src={project.cover_image_url}
              alt={project.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
            />
          </div>
        )}

        {/* Project Info */}
        <div className="mb-8">
          {editingProject ? (
            <div className="bg-gray-900 rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4 text-neon-green">Edit Project</h2>
              
              {/* Cover Image Edit */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-neon-green">Cover Image</label>
                {editCoverImagePreview ? (
                  <div className="relative w-full h-40 md:h-56 rounded-lg overflow-hidden mb-2">
                    <Image
                      src={editCoverImagePreview}
                      alt="Cover preview"
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 768px"
                    />
              <button
                      onClick={() => {
                        setEditCoverImage(null)
                        setEditCoverImagePreview(project.cover_image_url || null)
                      }}
                      className="absolute top-2 right-2 bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-70"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : null}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleEditCoverImageChange}
                  className="w-full text-sm text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-white file:text-black hover:file:bg-gray-200"
                />
              </div>

              {/* Title Edit */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-neon-green">Title *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-neon-green"
                />
              </div>

              {/* Description Edit */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-neon-green">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-neon-green resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={cancelEditingProject}
                  disabled={savingProject}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProject}
                  disabled={savingProject || !editTitle.trim()}
                  className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {savingProject ? 'Saving...' : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                  </>
                )}
              </button>
            </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col gap-1">
                  <h1 className="text-3xl sm:text-4xl font-bold">{project.title}</h1>
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    {creatorUsername && (
                      <span>{creatorUsername}</span>
                    )}
                    {tracks.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
                      </>
                    )}
          </div>
                </div>
            {/* Project Menu Button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                if (!isProjectMenuOpen) {
                  setTrackMenuOpen(false) // This will trigger forceCloseMenu in TrackPlaylist
                }
                setIsProjectMenuOpen(!isProjectMenuOpen)
              }}
              className="w-12 h-12 sm:w-10 sm:h-10 bg-gray-800 text-white rounded-lg flex items-center justify-center hover:bg-gray-700 active:bg-gray-600 transition touch-manipulation"
              title="More options"
              type="button"
            >
              <MoreVertical className="w-6 h-6 sm:w-5 sm:h-5" />
            </button>
          </div>
          {project.description && (
            <p className="text-neon-green text-lg mb-6 opacity-90">{project.description}</p>
          )}
            </>
          )}

          {/* Metrics - Only show for creators */}
          {isCreator && metrics && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <Eye className="w-6 h-6 mx-auto mb-2 text-neon-green opacity-70" />
                <div className="text-2xl font-bold text-neon-green">{metrics.plays || 0}</div>
                <div className="text-sm text-neon-green opacity-70">Plays</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <Share2 className="w-6 h-6 mx-auto mb-2 text-neon-green opacity-70" />
                <div className="text-2xl font-bold text-neon-green">{metrics.shares || 0}</div>
                <div className="text-sm text-neon-green opacity-70">Shares</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <Plus className="w-6 h-6 mx-auto mb-2 text-neon-green opacity-70" />
                <div className="text-2xl font-bold text-neon-green">{metrics.adds || 0}</div>
                <div className="text-sm text-neon-green opacity-70">Adds</div>
              </div>
            </div>
          )}

          {/* Settings - Only show for creators */}
          {isCreator && (
          <div className="bg-gray-900 rounded-xl p-6 md:p-8 mb-6 border border-gray-800">
            <h3 className="font-semibold mb-6 text-neon-green text-lg">Project Settings</h3>
            <div className="space-y-6">
              {/* Sharing Toggle */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1 mr-4">
                  <div className="font-medium text-white text-base">Project Sharing</div>
                  <div className="text-sm text-gray-400 mt-1">
                    Allow others to view this project via share link
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const newValue = !(project.sharing_enabled ?? true)
                    const { error } = await supabase
                      .from('projects')
                      .update({ sharing_enabled: newValue })
                      .eq('id', project.id)
                    if (error) {
                      showToast('Failed to update sharing setting', 'error')
                    } else {
                      setProject({ ...project, sharing_enabled: newValue })
                      showToast(`Sharing ${newValue ? 'enabled' : 'disabled'}`, 'success')
                    }
                  }}
                  style={{
                    position: 'relative',
                    width: '56px',
                    height: '32px',
                    borderRadius: '16px',
                    backgroundColor: (project.sharing_enabled ?? true) ? '#39FF14' : '#4B5563',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <div 
                    style={{
                      position: 'absolute',
                      top: '4px',
                      left: (project.sharing_enabled ?? true) ? '28px' : '4px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '12px',
                      backgroundColor: (project.sharing_enabled ?? true) ? '#000' : '#fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      transition: 'left 0.2s, background-color 0.2s',
                    }}
                  />
                </button>
              </div>

              {/* Downloads Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-gray-800 pt-5">
                <div className="flex-1 mr-4">
                  <div className="font-medium text-white text-base">Allow Downloads</div>
                  <div className="text-sm text-gray-400 mt-1">
                  Users can download tracks from this project
                </div>
              </div>
                <button
                  onClick={async () => {
                    const newValue = !project.allow_downloads
                    const { error } = await supabase
                      .from('projects')
                      .update({ allow_downloads: newValue })
                      .eq('id', project.id)
                    if (error) {
                      showToast('Failed to update download setting', 'error')
                    } else {
                      setProject({ ...project, allow_downloads: newValue })
                      showToast(`Downloads ${newValue ? 'enabled' : 'disabled'}`, 'success')
                    }
                  }}
                  style={{
                    position: 'relative',
                    width: '56px',
                    height: '32px',
                    borderRadius: '16px',
                    backgroundColor: project.allow_downloads ? '#39FF14' : '#4B5563',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <div 
                    style={{
                      position: 'absolute',
                      top: '4px',
                      left: project.allow_downloads ? '28px' : '4px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '12px',
                      backgroundColor: project.allow_downloads ? '#000' : '#fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      transition: 'left 0.2s, background-color 0.2s',
                    }}
                  />
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Project Notes (Private to Creator) - Only show if user is creator */}
          {isCreator && (
          <div className="bg-gray-900 rounded-lg p-4 mb-6 border border-yellow-900/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <FileText className="w-5 h-5 text-yellow-400 mr-2" />
                <h3 className="font-semibold text-neon-green">Project Notes</h3>
                <span className="text-xs text-white opacity-60 ml-3">(Private)</span>
              </div>
              {!editingProjectNote && (
                <button
                  onClick={() => setEditingProjectNote(true)}
                  className="text-sm text-black hover:opacity-80 flex items-center gap-1"
                >
                  <Edit className="w-4 h-4" />
                  {projectNote ? 'Edit' : 'Add Note'}
                </button>
              )}
            </div>

            {editingProjectNote ? (
              <div className="space-y-3">
                <textarea
                  value={projectNoteContent}
                  onChange={(e) => setProjectNoteContent(e.target.value)}
                  placeholder="Add private notes about this project (not visible to listeners)..."
                  rows={6}
                  className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-yellow-600 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveProjectNote}
                    disabled={savingNote === 'project'}
                    className="flex items-center gap-2 bg-yellow-600 text-black px-4 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-500 transition disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {savingNote === 'project' ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingProjectNote(false)
                      setProjectNoteContent(projectNote?.content || '')
                    }}
                    className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : projectNote ? (
                        <div className="bg-black rounded-lg p-3 text-sm text-neon-green whitespace-pre-wrap opacity-90">
                {projectNote.content}
              </div>
            ) : (
              <p className="text-sm text-neon-green opacity-70 italic">No notes yet. Click "Add Note" to add private notes about this project.</p>
            )}
          </div>
          )}
        </div>

        {/* Tracks */}
        <div>
          {/* Add Track button for creators */}
          {isCreator && (
            <div className="flex justify-end mb-4">
              <button
                onClick={handleAddNewTrack}
                className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full font-semibold hover:bg-gray-200 transition"
              >
                <Plus className="w-4 h-4" />
                Add Track
              </button>
            </div>
          )}

          {/* Add Track Form (for creators) */}
          {isCreator && showAddTrackForm && (
            <div className="bg-gray-900 rounded-lg p-4 mb-4 border-2 border-neon-green border-opacity-30">
          <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-neon-green">Add New Tracks</h3>
                <button
                  onClick={() => {
                    setShowAddTrackForm(false)
                    setNewTracks([])
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
          </div>

              <div className="space-y-4 mb-4">
                {newTracks.map((track, index) => (
                  <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-medium text-neon-green">Track {index + 1}</h4>
                      <button
                        onClick={() => removeNewTrack(index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
            </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-neon-green opacity-70 mb-1">Audio File (MP3, WAV, M4A, FLAC, OGG) *</label>
                        <input
                          type="file"
                          accept="audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/flac,audio/ogg,.mp3,.wav,.m4a,.aac,.flac,.ogg"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleNewTrackFileChange(index, file)
                          }}
                          className="w-full text-sm text-white"
                        />
                      </div>

                          <div>
                        <label className="block text-xs text-neon-green opacity-70 mb-1">Track Title *</label>
                        <input
                          type="text"
                          value={track.title}
                          onChange={(e) => {
                            const updatedTracks = [...newTracks]
                            updatedTracks[index].title = e.target.value
                            setNewTracks(updatedTracks)
                          }}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green"
                          placeholder="Enter track title"
                        />
                          </div>
                    </div>
                  </div>
                ))}
                    </div>

              <div className="flex gap-3">
                <button
                  onClick={handleAddNewTrack}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"
                >
                  <Plus className="w-4 h-4" />
                  Add Another Track
                </button>
                <button
                  onClick={handleSaveNewTracks}
                  disabled={addingTracks || newTracks.length === 0 || newTracks.some(t => !t.file || !t.title || t.title.trim() === '')}
                  className="ml-auto bg-white text-black px-6 py-2 rounded-full font-semibold hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingTracks ? 'Adding...' : 'Save Tracks'}
                </button>
              </div>
            </div>
          )}

          {tracks.length === 0 ? (
            <div className="text-center py-12 bg-gray-900 rounded-lg">
              <p className="text-neon-green">No tracks in this project yet.</p>
                        </div>
          ) : (
            <TrackPlaylist
              tracks={tracks}
              projectCoverUrl={project.cover_image_url}
              projectTitle={project.title}
              isCreator={isCreator}
              onEditTrack={startEditingTrack}
              onDeleteTrack={handleDeleteTrack}
              onMenuOpen={() => {
                setIsProjectMenuOpen(false) // Close project menu when track menu opens
                setTrackMenuOpen(true)
              }}
              forceCloseMenu={isProjectMenuOpen} // Force track menu closed when project menu is open
              onTrackPlay={async (trackId) => {
                // Track play in database
                try {
                  let userId: string | null = null
                  if (user) {
                    const privyId = user.id
                    const { data: dbUser } = await supabase
                      .from('users')
                      .select('id')
                      .eq('privy_id', privyId)
                      .single()
                    userId = dbUser?.id || null
                  }

                  let ipAddress: string | null = null
                  try {
                    const response = await fetch('https://api.ipify.org?format=json')
                    const data = await response.json()
                    ipAddress = data.ip || null
                  } catch (ipError) {
                    console.warn('Could not fetch IP address:', ipError)
                  }

                  const { error: playError } = await supabase
                    .from('track_plays')
                    .insert({ 
                      track_id: trackId,
                      user_id: userId,
                      ip_address: ipAddress
                    })

                  if (playError) {
                    console.error('Error inserting track play:', playError)
                  }

                  // Update project metrics
                  const { data: currentMetrics, error: metricsError } = await supabase
                    .from('project_metrics')
                    .select('plays')
                    .eq('project_id', project.id)
                    .single()

                  if (metricsError && metricsError.code !== 'PGRST116') {
                    console.error('Error fetching metrics:', metricsError)
                  }

                  if (currentMetrics) {
                    const currentPlays = currentMetrics.plays ?? 0
                    const { error: updateError } = await supabase
                      .from('project_metrics')
                      .update({ plays: currentPlays + 1 })
                      .eq('project_id', project.id)
                    
                    if (!updateError) {
                      const { data: updatedMetrics } = await supabase
                        .from('project_metrics')
                        .select('*')
                        .eq('project_id', project.id)
                        .single()
                      if (updatedMetrics) {
                        setMetrics(updatedMetrics)
                      }
                    }
                  } else {
                    await supabase
                      .from('project_metrics')
                      .insert({ project_id: project.id, plays: 1, shares: 0, adds: 0 })
                  }
                } catch (error) {
                  console.error('Error tracking play:', error)
                }
              }}
            />
          )}

          {/* Track Notes Section - Only for creators */}
          {isCreator && tracks.length > 0 && (
            <div className="mt-6 bg-gray-900 rounded-xl p-4">
              <div className="flex items-center mb-4">
                <FileText className="w-5 h-5 text-yellow-400 mr-2" />
                <h3 className="font-semibold text-neon-green">Track Notes</h3>
                <span className="text-xs text-white opacity-60 ml-3">(Private)</span>
              </div>
              <div className="space-y-3">
                {tracks.map((track) => {
                  const trackNote = trackNotes[track.id]
                  const isEditingNote = editingTrackNotes.hasOwnProperty(track.id)
                  const noteContent = editingTrackNotes[track.id] || ''

                  return (
                    <div key={track.id} className="border-b border-gray-800 pb-3 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-white font-medium">{track.title}</span>
                        {!isEditingNote && (
                          <button
                            onClick={() => startEditingTrackNote(track.id)}
                            className="text-xs text-black hover:opacity-80 flex items-center gap-1"
                          >
                            <Edit className="w-3 h-3" />
                            {trackNote ? 'Edit' : 'Add'}
                          </button>
                        )}
                      </div>
                      {isEditingNote ? (
                        <div className="space-y-2">
                          <textarea
                            value={noteContent}
                            onChange={(e) => setEditingTrackNotes({ ...editingTrackNotes, [track.id]: e.target.value })}
                            placeholder="Add private notes..."
                            rows={2}
                            className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-green resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveTrackNote(track.id)}
                              disabled={savingNote === track.id}
                              className="flex items-center gap-1 bg-neon-green text-black px-3 py-1 rounded text-xs font-semibold hover:opacity-80 transition disabled:opacity-50"
                            >
                              <Save className="w-3 h-3" />
                              {savingNote === track.id ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => {
                                const newEditing = { ...editingTrackNotes }
                                delete newEditing[track.id]
                                setEditingTrackNotes(newEditing)
                              }}
                              className="text-xs text-gray-400 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : trackNote ? (
                        <p className="text-xs text-gray-400">{trackNote.content}</p>
                      ) : (
                        <p className="text-xs text-gray-500 italic">No notes</p>
                    )}
                  </div>
                )
              })}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Track Edit Modal */}
      {editingTrackId && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-[9999] flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Edit Track</h2>
              <button
                onClick={cancelEditingTrackModal}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Track Title</label>
              <input
                type="text"
                value={editingTrackTitle}
                onChange={(e) => setEditingTrackTitle(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-neon-green"
                placeholder="Enter track title"
                autoFocus
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelEditingTrackModal}
                className="px-6 py-2 text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={saveEditingTrack}
                disabled={!editingTrackTitle.trim() || savingTracks[editingTrackId]}
                className="px-6 py-2 bg-neon-green text-black rounded-full font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingTracks[editingTrackId] ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-[9999] flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">Project Notes</h2>
              <button
                onClick={() => setShowNotesModal(false)}
                className="text-neon-green hover:opacity-80"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            {isCreator ? (
              <div>
                {editingProjectNote ? (
                  <div>
                    <textarea
                      value={projectNoteContent}
                      onChange={(e) => setProjectNoteContent(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded p-3 text-sm text-white focus:outline-none focus:border-neon-green h-48 mb-4"
                      placeholder="Add your private notes about this project..."
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingProjectNote(false)
                          setProjectNoteContent(projectNote?.content || '')
                        }}
                        className="text-sm text-neon-green hover:opacity-80"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          await handleSaveProjectNote()
                          setShowNotesModal(false)
                        }}
                        className="text-sm bg-white text-black px-4 py-2 rounded-full hover:bg-gray-200"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-neon-green mb-4">
                      {projectNote?.content || 'No notes yet. Click "Edit" to add notes.'}
                    </p>
                    <button
                      onClick={() => setEditingProjectNote(true)}
                      className="text-sm bg-white text-black px-4 py-2 rounded-full hover:bg-gray-200"
                    >
                      {projectNote ? 'Edit Notes' : 'Add Notes'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-neon-green">Notes are only available to the project creator.</p>
            )}
          </div>
        </div>
      )}

      {/* Share Modal */}
      {project && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={handleCloseShareModal}
          shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${project.share_token}`}
          title={project.title}
        />
      )}

      {/* Project Menu Bottom Tray - Full width on mobile like ShareModal */}
      {isProjectMenuOpen && project && (
        <>
          {/* Backdrop */}
          <div 
            onClick={() => setIsProjectMenuOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              zIndex: 100,
            }}
          />
          
          {/* Bottom Sheet */}
          <div
            style={{
              position: 'fixed',
              bottom: isMobile ? 0 : '50%',
              left: isMobile ? 0 : '50%',
              right: isMobile ? 0 : 'auto',
              transform: isMobile ? 'none' : 'translate(-50%, 50%)',
              width: isMobile ? '100%' : '400px',
              maxWidth: '100%',
              backgroundColor: '#111827',
              borderRadius: isMobile ? '16px 16px 0 0' : '16px',
              zIndex: 101,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid #374151',
              flexDirection: 'column',
            }}>
              <div style={{ width: '40px', height: '4px', backgroundColor: '#4B5563', borderRadius: '2px', marginBottom: '12px' }} />
              <h2 style={{ 
                fontSize: '16px', 
                fontWeight: 600, 
                color: '#fff',
                margin: 0,
                textAlign: 'center',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {project.title}
              </h2>
            </div>

            {/* Menu Options */}
            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => handleOpenShareModal()}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                }}
                className="hover:bg-gray-700 transition"
              >
                <div style={{
                  width: '44px',
                  height: '44px',
                  backgroundColor: '#374151',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Share2 style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Share</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    Share this project with others
                  </div>
                </div>
              </button>
              
              {user && (
                <button
                  onClick={() => handleAddToQueue()}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    backgroundColor: '#1f2937',
                    color: '#fff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    textAlign: 'left',
                  }}
                  className="hover:bg-gray-700 transition"
                >
                  <div style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#374151',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <ListMusic style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Add to Queue</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      Add project to your play queue
                    </div>
                  </div>
                </button>
              )}
              
              {user && (
                <button
                  onClick={() => {
                    // If creator has no notes yet, start in edit mode
                    if (isCreator && !projectNote?.content) {
                      setEditingProjectNote(true)
                    }
                    setShowNotesModal(true)
                    setIsProjectMenuOpen(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    backgroundColor: '#1f2937',
                    color: '#fff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    textAlign: 'left',
                  }}
                  className="hover:bg-gray-700 transition"
                >
                  <div style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#374151',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <FileText style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Notes</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      View or add project notes
                    </div>
                  </div>
                </button>
              )}
              
              {user && (
                <button
                  onClick={() => handleTogglePin()}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    backgroundColor: '#1f2937',
                    color: '#fff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    textAlign: 'left',
                  }}
                  className="hover:bg-gray-700 transition"
                >
                  <div style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#374151',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {isPinned ? (
                      <PinOff style={{ width: '22px', height: '22px', color: '#9ca3af' }} />
                    ) : (
                      <Pin style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{isPinned ? 'Unpin Project' : 'Pin Project'}</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                      {isPinned ? 'Remove from pinned projects' : 'Pin to top of your dashboard'}
                    </div>
                  </div>
                </button>
              )}

              {isCreator && (
                <>
                  <button
                    onClick={() => startEditingProject()}
                    style={{
                      width: '100%',
                      padding: '16px 20px',
                      backgroundColor: '#1f2937',
                      color: '#fff',
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      fontSize: '16px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      textAlign: 'left',
                    }}
                    className="hover:bg-gray-700 transition"
                  >
                    <div style={{
                      width: '44px',
                      height: '44px',
                      backgroundColor: '#374151',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Edit style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Edit Project</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                        Modify project details
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteProject()}
                    style={{
                      width: '100%',
                      padding: '16px 20px',
                      backgroundColor: '#1f2937',
                      color: '#ef4444',
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      fontSize: '16px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      textAlign: 'left',
                    }}
                    className="hover:bg-gray-700 transition"
                  >
                    <div style={{
                      width: '44px',
                      height: '44px',
                      backgroundColor: '#374151',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Trash2 style={{ width: '22px', height: '22px', color: '#ef4444' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Delete Project</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                        Permanently remove this project
                      </div>
                    </div>
                  </button>
                </>
              )}
            </div>

            {/* Cancel button */}
            <div style={{ padding: '12px 20px 20px' }}>
              <button
                onClick={() => setIsProjectMenuOpen(false)}
                style={{
                  width: '100%',
                  padding: '16px',
                  backgroundColor: '#374151',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                className="hover:bg-gray-600 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

