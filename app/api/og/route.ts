import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const OG_WIDTH = 1200
const OG_HEIGHT = 630

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return new NextResponse('Missing token', { status: 400 })
  }

  try {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('cover_image_url')
      .eq('share_token', token)
      .single()

    const imageUrl = project?.cover_image_url
    if (!imageUrl) {
      return new NextResponse('No cover image', { status: 404 })
    }

    const upstream = await fetch(imageUrl)
    if (!upstream.ok) {
      return new NextResponse('Failed to fetch image', { status: 502 })
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())

    const processed = await sharp(buffer)
      .rotate()           // auto-rotate based on EXIF orientation, then strip EXIF
      .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 80 })
      .toBuffer()

    return new NextResponse(new Uint8Array(processed), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    })
  } catch (err) {
    console.error('OG image processing error:', err)
    return new NextResponse('Image processing failed', { status: 500 })
  }
}
