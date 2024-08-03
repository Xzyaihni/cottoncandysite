precision mediump float;

const ivec2 CANVAS_DIMENSIONS = ivec2(640, 640);

const ivec2 NOISES_DIMENSIONS = ivec2(7, 3);
const int NOISES_AMOUNT = NOISES_DIMENSIONS.x * NOISES_DIMENSIONS.y;

const int BLOBS_AMOUNT = 32; //COPY TO JS

uniform vec2 blobs_pos[BLOBS_AMOUNT];
uniform float blobs_size[BLOBS_AMOUNT];

const int STARS_AMOUNT = 16; //COPY TO JS

uniform vec2 stars_pos[STARS_AMOUNT];

uniform vec2 mouse_pos;

uniform float held_time;

uniform float time_wave;
uniform float underwater_wave;


uniform vec3 sky_bottom_color;
uniform vec3 sky_top_color;

uniform vec3 star_color;

uniform vec3 cloud_color;

uniform vec3 wave_top_color;
uniform vec3 water_color;
uniform vec3 water_refraction_color;


vec4 overmix(vec3 c0, vec3 c1, vec4 overmix_color, float amount, float overmix_factor)
{
    vec4 normal_mix = vec4(mix(c0, c1, min(amount, 1.0)), 1.0);
    return mix(normal_mix, overmix_color, clamp(amount - 1.0, 0.0, 1.0) * overmix_factor);
}

float wave_sine(float x)
{
    return sin(x * 4.0 + time_wave) * 0.6
        + sin(x * 7.0 + time_wave) * 0.95
        + sin(x * 14.0 + time_wave) * 0.9
        + sin(x * 23.0 + time_wave * 2.0) * 0.8;
}

float height_at(float x)
{
    float sin_wave = wave_sine(x);

    float wave_level = 0.2;

    float x_diff = x - mouse_pos.x;
    float y_diff = mouse_pos.y - wave_level;

    float dist = max(sqrt(x_diff*x_diff + y_diff*y_diff), 0.0);

    float dist_height = (1.0 - dist) * held_time * 0.5;
    if (y_diff < 0.0)
    {
        dist_height *= max(1.0 + y_diff * 8.0, 0.0);
    }

    return wave_level + sin_wave * 0.005 + dist_height * dist_height * 0.3;
}

vec2 noise_at(int x, int y)
{
    vec2 wave_pos = vec2(float(x) * 2.3 + float(y) * 1.23, float(y) * 1.77 + float(x) * 1.11);

    vec2 calc_pos = abs(sin(underwater_wave + wave_pos)) * 0.8;

    return vec2(float(x) + calc_pos.x, float(y) + calc_pos.y);
}

float voronoi_at(vec2 pos)
{
    int x_cell = int(pos.x);
    int y_cell = int(pos.y);

    vec2 min_dist = vec2(1.0, 1.0);
    for(int y = -1; y < 2; ++y)
    {
        for(int x = -1; x < 2; ++x)
        {
            int c_x = x_cell + x;
            int c_y = y_cell + y;

            if (c_x < 0 || c_x > NOISES_DIMENSIONS.x-1 || c_y < 0 || c_y > NOISES_DIMENSIONS.y-1)
            {
                continue;
            }

            vec2 noise_point = noise_at(c_x, c_y);

            float dist = distance(noise_point, pos);

            if (dist < min_dist.x)
            {
                min_dist.y = min_dist.x;
                min_dist.x = dist;
            } else if (dist < min_dist.y)
            {
                min_dist.y = dist;
            }
        }
    }

    return 1.0 - min(min_dist.y - min_dist.x, 1.0);
}

vec4 pixel_at(vec2 pixel)
{
    float cloud_dist = 0.0;
    for(int i = 0; i < BLOBS_AMOUNT; ++i)
    {
        float dist = distance(pixel, blobs_pos[i]) * 640.0;

        cloud_dist += max(log(min(blobs_size[i] / dist, 1.0)) + 1.0, 0.0);
    }

    vec4 color = vec4(mix(sky_bottom_color, sky_top_color, pixel.y), 1.0);

    float total_star_dist = 0.0;
    for(int i = 0; i < STARS_AMOUNT; ++i)
    {
        vec2 diff = pixel - stars_pos[i];
        float dist = (abs(diff.x) + abs(diff.y));

        total_star_dist += max(0.0390625 / dist, 0.0);
    }

    float star_pre = total_star_dist / float(STARS_AMOUNT);
    float star_amount = star_pre * star_pre;

    color = overmix(color.xyz, star_color, vec4(1.0), star_amount, 1.0);

    {
        //cloud
        float edge_start = 0.8;
        float edge_factor = 1.0 / (1.0 - edge_start);

        float edge = step(edge_start, cloud_dist);
        float amount = edge * (cloud_dist - edge_start) * edge_factor;

        //color = vec4(mix(color.xyz, cloud_color, min(amount, 1.0)), 1.0);
        color = overmix(color.xyz, cloud_color, vec4(1.0), amount, 0.2);
    }

    return color;
}

void main()
{
    vec2 pixel = gl_FragCoord.xy / vec2(CANVAS_DIMENSIONS);

    vec4 color = pixel_at(pixel);

    float wave_width = 0.002;

    float wave_height = height_at(pixel.x);

    //color the water
    if (abs(pixel.y - wave_height) < wave_width)
    {
        //wave top
        color = vec4(mix(color.xyz, wave_top_color, 0.8), 1.0);
    } else if (pixel.y < wave_height)
    {
        //inside of water
        float depth = wave_height - pixel.y;

        float reflection_end = 0.08;
        float reflection_inv = 1.0 / reflection_end * 0.75;

        if (depth < reflection_end)
        {
            float u_amount = max((reflection_end - depth) * reflection_inv, 0.0);
            float amount = u_amount * u_amount;

            color = mix(color, pixel_at(vec2(pixel.x, wave_height + depth)), amount);
        }

        float noises_start = depth + 0.1;
        float noises_full = 0.75;

        vec2 wavy_pixel = pixel + vec2(wave_sine(pixel.y), wave_sine(pixel.x)) * 0.01;

        vec2 scaled = wavy_pixel * vec2(NOISES_DIMENSIONS);
        scaled.y /= noises_start;

        float min_dist = voronoi_at(scaled);

        float scaled_begin = min(max(noises_start - pixel.y, 0.0) / noises_start / noises_full, 1.0);
        float noise_mix = scaled_begin * pow(min_dist, 4.0);

        color = vec4(
            mix(
                mix(color.xyz, water_color, min(depth * 1.5 + 0.13, 1.0)),
                water_refraction_color,
                noise_mix * 0.25
            ),
            1.0
        );
    }

    gl_FragColor = color;
}