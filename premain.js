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

    const dpr = window.devicePixelRatio;
    gl.uniform2f(program_info.uniform_locations.canvas_dimensions, canvas.width * dpr, canvas.height * dpr);
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

        const size = Math.max(Math.random() * 50, 15);
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
