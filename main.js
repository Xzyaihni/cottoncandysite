const v_shader = `attribute vec4 a_vertex_position;

void main()
{
    gl_Position = a_vertex_position;
}`;
const f_shader = `precision mediump float;

const ivec2 NOISES_DIMENSIONS = ivec2(7, 3);
const int NOISES_AMOUNT = NOISES_DIMENSIONS.x * NOISES_DIMENSIONS.y;

const int BLOBS_AMOUNT = 32; //COPY TO JS

uniform vec2 canvas_dimensions;

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
        float dist = distance(pixel, blobs_pos[i]) * canvas_dimensions.x;

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
    vec2 pixel = gl_FragCoord.xy / canvas_dimensions;

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
}`;
const BLOBS_AMOUNT = 32; //COPY TO JS
const STARS_AMOUNT = 16; //COPY TO JS
let canvas = document.getElementById("clouds_canvas");
let gl = canvas.getContext("webgl");

const sugar_text = document.getElementById("sugar_text");

const custom_colors = ["sky_bottom_color", "sky_top_color",
    "star_color", "cloud_color",
    "wave_top_color", "water_color", "water_refraction_color"];

let blobs_pos = [];

let blobs_max_size = [];
let blobs_size = [];

let blobs_x_velocity = [];
let blobs_y_velocity = [];

let stars_pos = [];

let stars_x_original = [];
let stars_y_original = [];

let stars_x_velocity = [];
let stars_y_velocity = [];

let sugar_amount = 0.0;
const sugar_factor = 0.1;

const stars_speed = 2.0;
const stars_friction = 0.1;

const wind_speed = 800;
const float_amount = 25;

const grow_factor = 5.0;

const wave_speed = wind_speed * (-0.01);
const underwater_wave_speed = 40.0;

const cloud_min_height = 0.703;

const attraction_strength = 100;
const max_gravity = 20;

const friction = 0.1;

const gain_rate = 2.0;
const reduce_rate = 4.0;

const dissolve_speed = 150.0;
const min_size = 7.5;

let program_info = null;

let total_time = 0.0;
let previous_time = 0.0;

let held_time = 0.0;

let mouse = {x: 0, y: 0};
let mouse_down = false;

canvas.addEventListener("mousedown", begin_attract);
canvas.addEventListener("mouseup", end_attract);
canvas.addEventListener("mouseout", end_attract);
canvas.addEventListener("mousemove", attract);

document.addEventListener("DOMContentLoaded", main);

const resizer = new ResizeObserver(on_resize_observer);
resizer.observe(canvas, {box: "content-box"});

function on_resize_observer(events)
{
    for (const event of events)
    {
        if (!event.devicePixelContentBoxSize)
        {
            return;
        }

        const box = event.devicePixelContentBoxSize[0];

        resize_canvas_correct(box.inlineSize, box.blockSize);
    }
}

function resize_canvas_correct(new_width, new_height)
{
    if (canvas.width !== new_width || canvas.height !== new_height)
    {
        canvas.width = new_width;
        canvas.height = new_height;

        gl.viewport(0, 0, canvas.width, canvas.height);

        main();
    }
}

function canvas_dependent()
{
    if (program_info === null)
    {
        return;
    }

    gl.uniform2f(program_info.uniform_locations.canvas_dimensions, canvas.width, canvas.height);
}

function main()
{
    if (gl === null)
    {
        alert("nyo opengl im so sowy 😭");
        return;
    } else
    {
        initialize_clouds();
    }
}

function begin_attract(event)
{
    mouse_down = true;
    attract(event);
}

function end_attract(event)
{
    mouse_down = false;
}

function attract(event)
{
    const rect = canvas.getClientRects()[0];
    mouse = {
        x: (event.clientX - rect.x) / canvas.width,
        y: 1.0 - (event.clientY - rect.y) / canvas.height
    };

    if (program_info !== null)
    {
        gl.uniform2f(program_info.uniform_locations.mouse_pos, mouse.x, mouse.y);
    }
}

function parse_color(hex)
{
    const parse_one = (n) =>
    {
        const val = hex.substr(n, 2);

        return parseInt(val, 16) / 255;
    };

    return {r: parse_one(1), g: parse_one(3), b: parse_one(5)};
}

function set_color(name, color)
{
    const value = parse_color(color);

    gl.uniform3f(program_info.uniform_locations[name], value.r, value.g, value.b);
}

function set_color_event(event)
{
    set_color(event.target.id, event.target.value);
}

function setup_colors()
{
    custom_colors.forEach((color) =>
    {
        const element = document.getElementById(color);

        set_color(color, element.value);
        element.addEventListener("input", set_color_event);
    });
}

function set_sugar_text(number)
{
    sugar_text.innerText = "sugar: " + number.toFixed(2).toString() + " grams";
}

function draw_frame(dt)
{
    if (update_physics(Math.min(dt, 0.1)) === null)
    {
        alert("something wrong with the physics ; -;");
        return;
    }

    //draw the rectangle with everything on it
    //0 offset 4 vertices
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function update_blob_size()
{
    gl.uniform1fv(program_info.uniform_locations.blobs_size, blobs_size);
}

function update_physics(dt)
{
    if (program_info === null)
    {
        return null;
    }

    gl.uniform2fv(program_info.uniform_locations.blobs_pos, blobs_pos);
    gl.uniform2fv(program_info.uniform_locations.stars_pos, stars_pos);

    const time_wave = (total_time % wave_speed) / wave_speed * Math.PI * 2;
    gl.uniform1f(program_info.uniform_locations.time_wave, time_wave);

    const underwater_wave = (total_time % underwater_wave_speed) / underwater_wave_speed * Math.PI * 2;
    gl.uniform1f(program_info.uniform_locations.underwater_wave, underwater_wave);

    const scaled_held_time = held_time * held_time;
    gl.uniform1f(program_info.uniform_locations.held_time, scaled_held_time);

    update_blobs(dt);
    update_stars(dt);
}

function update_blobs(dt)
{
    for(let i = 0; i < BLOBS_AMOUNT; ++i)
    {
        const margin = blobs_size[i] * 2.6 / canvas.width;

        const mass = blobs_size[i] * blobs_size[i];

        blobs_x_velocity[i] += dt * (wind_speed / mass);

        const height_diff = Math.max(cloud_min_height - blobs_pos[i*2+1], 0);
        blobs_y_velocity[i] += dt * float_amount * height_diff;

        if (height_diff < 0.05 && blobs_size[i] < blobs_max_size[i])
        {
            blobs_size[i] = Math.min(blobs_size[i] + dt * grow_factor, blobs_max_size[i]);

            update_blob_size();
        }

        if (mouse_down)
        {
            const x_diff = (blobs_pos[i*2] - mouse.x) * canvas.width;
            const y_diff = (blobs_pos[i*2+1] - mouse.y) * canvas.height;

            const square_dist = x_diff * x_diff + y_diff * y_diff;

            const gravity = Math.min(mass / square_dist * attraction_strength, max_gravity);

            const magnitude = Math.sqrt(x_diff*x_diff + y_diff*y_diff);

            blobs_x_velocity[i] -= (x_diff / magnitude) * gravity * dt;
            blobs_y_velocity[i] -= (y_diff / magnitude) * gravity * dt;
        }

        blobs_pos[i*2] += Math.min(blobs_x_velocity[i] * dt * 0.09375, 0.078125);
        blobs_pos[i*2+1] += Math.min(blobs_y_velocity[i] * dt * 0.09375, 0.078125);

        blobs_x_velocity[i] -= Math.min(blobs_x_velocity[i] * friction * dt * 60, 1.0);
        blobs_y_velocity[i] -= Math.min(blobs_y_velocity[i] * friction * dt * 60, 1.0);

        blobs_pos[i*2] = (blobs_pos[i*2] + margin) % (1 + margin * 2) - margin;
        blobs_pos[i*2+1] = (blobs_pos[i*2+1] + margin) % (1 + margin * 2) - margin;

        const wave_level = 0.3;

        const bottom_height = blobs_pos[i*2+1] - blobs_size[i] / canvas.height;
        if (bottom_height < wave_level)
        {
            const previous_size = blobs_size[i];
            const wave_diff = wave_level - bottom_height;

            blobs_size[i] = Math.max(blobs_size[i] - wave_diff * dissolve_speed * dt, min_size);

            update_blob_size();

            sugar_amount += (previous_size - blobs_size[i]) * sugar_factor;
            set_sugar_text(sugar_amount);
        }
    }
}

function update_stars(dt)
{
    for(let i = 0; i < STARS_AMOUNT; ++i)
    {
        const star_x_diff = stars_x_original[i] - stars_pos[i*2];
        const star_y_diff = stars_y_original[i] - stars_pos[i*2+1];

        const star_u_dist = Math.sqrt(star_x_diff * star_x_diff + star_y_diff * star_y_diff);

        const star_dist = Math.max(star_u_dist * canvas.width, 1.0);

        stars_x_velocity[i] += (Math.random()-0.5) * stars_speed / star_dist;
        stars_y_velocity[i] += (Math.random()-0.5) * stars_speed / star_dist;

        stars_pos[i*2] += Math.min(stars_x_velocity[i] * dt * 0.09375, 0.078125);
        stars_pos[i*2+1] += Math.min(stars_y_velocity[i] * dt * 0.09375, 0.078125);

        stars_x_velocity[i] -= Math.min(stars_x_velocity[i] * stars_friction * dt * 60, 1.0);
        stars_y_velocity[i] -= Math.min(stars_y_velocity[i] * stars_friction * dt * 60, 1.0);
    }
}

function create_objects()
{
    blobs_pos = [];

    blobs_max_size = [];
    blobs_size = [];

    blobs_x_velocity = [];
    blobs_y_velocity = [];

    stars_pos = [];

    stars_x_original = [];
    stars_y_original = [];

    stars_x_velocity = [];
    stars_y_velocity = [];

    for(let i = 0; i < BLOBS_AMOUNT; ++i)
    {
        const x = Math.sqrt(Math.random())*1.3 - 0.3;
        const y = 1.0 - Math.sqrt(Math.random()) * 0.33;

        blobs_pos.push(x);
        blobs_pos.push(y);

        const size = Math.max(Math.random() * 50, 15) / (640.0 / canvas.width);
        blobs_size.push(size);
        blobs_max_size.push(size);

        blobs_x_velocity.push(0.0);
        blobs_y_velocity.push(0.0);
    }

    for(let i = 0; i < STARS_AMOUNT; ++i)
    {
        const star_x = Math.random();
        const star_y = Math.random();

        stars_pos.push(star_x);
        stars_pos.push(star_y);

        stars_x_original.push(star_x);
        stars_y_original.push(star_y);

        stars_x_velocity.push(0.0);
        stars_y_velocity.push(0.0);
    }

    set_sugar_text(sugar_amount);
}

function proccess_frame(current_time)
{
    current_time *= 0.001;
    total_time = current_time;

    delta_time = current_time - previous_time;

    if (mouse_down)
    {
        held_time = Math.min(held_time + delta_time * gain_rate, 1.0);
    } else
    {
        held_time = Math.max(held_time - delta_time * reduce_rate, 0.0);
    }

    previous_time = current_time;

    draw_frame(delta_time);

    requestAnimationFrame(proccess_frame);
}

function initialize_clouds()
{
    program_info = attributes_info();
    if (program_info === null)
    {
        return;
    }

    gl.useProgram(program_info.program);

    const buffer = init_default_buffer(program_info);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    //default but still
    gl.frontFace(gl.CCW);

    create_objects();
    update_blob_size();

    setup_colors();

    canvas_dependent();

    requestAnimationFrame(proccess_frame);
}

function init_default_buffer(program_info)
{
    const position_buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, position_buffer);

    const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
        program_info.attribute_locations.vertex_position,
        2, //positions per vertex
        gl.FLOAT,
        false, //no normalization
        0, //calculate stride automatically
        0 //no offset
    );

    gl.enableVertexAttribArray(program_info.attribute_locations.vertex_position);

    return position_buffer;
}

function attributes_info()
{
    const shader_program = load_program();
    if (shader_program === null)
    {
        return null;
    }

    const get_attrib = name => gl.getAttribLocation(shader_program, name);
    const get_uniform = name => gl.getUniformLocation(shader_program, name);

    const program_info =
    {
        program: shader_program,
        attribute_locations:
        {
            vertex_position: get_attrib("a_vertex_position")
        },
        uniform_locations:
        {
            canvas_dimensions: get_uniform("canvas_dimensions"),
            blobs_pos: get_uniform("blobs_pos"),
            blobs_size: get_uniform("blobs_size"),
            stars_pos: get_uniform("stars_pos"),
            mouse_pos: get_uniform("mouse_pos"),
            time_wave: get_uniform("time_wave"),
            underwater_wave: get_uniform("underwater_wave"),
            held_time: get_uniform("held_time")
        }
    };

    custom_colors.forEach((color) =>
    {
        program_info.uniform_locations[color] = get_uniform(color);
    });

    return program_info;
}

function load_program()
{
    const vertex_shader = load_shader(v_shader, gl.VERTEX_SHADER);
    const fragment_shader = load_shader(f_shader, gl.FRAGMENT_SHADER);

    if (vertex_shader === null || fragment_shader === null)
    {
        return null;
    }

    const shader_program = gl.createProgram();
    gl.attachShader(shader_program, vertex_shader);
    gl.attachShader(shader_program, fragment_shader);
    gl.linkProgram(shader_program);

    if (!gl.getProgramParameter(shader_program, gl.LINK_STATUS))
    {
        const program_log = gl.getProgramInfoLog(shader_program);
        alert(`error linking shader program 😭: ${program_log}`);

        return null;
    } else
    {
        return shader_program;
    }
}

function load_shader(source, type)
{
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    {
        let type_stringified = "unknown";
        if (type === gl.VERTEX_SHADER)
        {
            type_stringified = "vertex";
        } else if (type === gl.FRAGMENT_SHADER)
        {
            type_stringified = "fragment";
        }

        const shader_log = gl.getShaderInfoLog(shader);
        alert(`error compiling shader 😭 (${type_stringified} type): ${shader_log}`);

        gl.deleteShader(shader);
        return null;
    } else
    {
        return shader;
    }
}
