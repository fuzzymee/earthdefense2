/* GLOBAL CONSTANTS AND VARIABLES */

/* assignment specific globals */
const INPUT_TRIANGLES_URL = "https://fuzzymee.github.io/earthdefense2/triangles.json"; // triangles file loc
const INPUT_ELLIPSOIDS_URL = "https://fuzzymee.github.io/earthdefense2/ellipsoids.json"; // ellipsoids file loc
const TEXTURES_URL = "https://fuzzymee.github.io/earthdefense2/textures/"; // textures file loc
var defaultEye = vec3.fromValues(0.0,0.6,-1.0); // default eye position in world space
var defaultCenter = vec3.fromValues(0.0,0.6,0.3); // default view direction in world space
var defaultUp = vec3.fromValues(0,1,0); // default view up vector
var viewMatrix = mat4.create();
var lightAmbient = vec3.fromValues(1,1,1); // default light ambient emission
var lightDiffuse = vec3.fromValues(1,1,1); // default light diffuse emission
var lightSpecular = vec3.fromValues(1,1,1); // default light specular emission
var lightPosition = vec3.fromValues(2,4,3); // default light position
var rotateTheta = Math.PI/50; // how much to rotate models by with each key press
var blendMode = 0.0;

/* webgl and geometry data */
var gl = null; // the all powerful gl object. It's all here folks!
var inputTriangles = []; // the triangle data as loaded from input files
var numTriangleSets = 0; // how many triangle sets in input scene
var inputEllipsoids = []; // the ellipsoid data as loaded from input files
var numEllipsoids = 0; // how many ellipsoids in the input scene
var inputOpaque = new Array(); // opaque models
var inputTranslucent = new Array(); // translucent models
var inputModels = new Array(); // models sorted by depth
var inputTrianglesSorted = new Array(); // triangles sorted by depth

var curInd = 0;

var vertexBuffers = []; // this contains vertex coordinate lists by set, in triples
var normalBuffers = []; // this contains normal component lists by set, in triples
var textureBuffers = []; // this contains texture uv lists by vertex, in doubles
var triSetSizes = []; // this contains the size of each triangle set
var triangleBuffers = []; // lists of indices into vertexBuffers by set, in triples

/* shader parameter locations */
var vPosAttribLoc; // where to put position for vertex shader
var vNormAttribLoc;
var vTexAttribLoc; // where to put texture for vertex shader
var mMatrixULoc; // where to put model matrix for vertex shader
var pvmMatrixULoc; // where to put project model view matrix for vertex shader
var ambientULoc; // where to put ambient reflecivity for fragment shader
var diffuseULoc; // where to put diffuse reflecivity for fragment shader
var specularULoc; // where to put specular reflecivity for fragment shader
var shininessULoc; // where to put specular exponent for fragment shader
var alphaULoc;  // where to put alpha value for fragment shader
var samplerUniform; // where to put the sampler for the fragment shader
var lightBlendULoc; // where to put the lighting/blending variabel for the fragment shader

var renderType = 0; // 0 for model sort, 1 for triangle sort

/* interaction variables */
var Eye = vec3.clone(defaultEye); // eye position in world space
var Center = vec3.clone(defaultCenter); // view direction in world space
var Up = vec3.clone(defaultUp); // view up vector in world space
var viewDelta = 0; // how much to displace view with each key press

// textures
var textures = new Array()  // array for holding textures, [tag: '', src: '', texture: WebGLTexture]
var pngs = ['shot', 'stars', 'explosion1', 'explosion2', 'explosion3', 'explosion4', 'explosion5', 'explosion6',
    'explosion7', 'highlight', 'shield', 'map']
var jpgs = ['asteroid', 'earth', 'sun', 'deathstar', 'moon', 'red', 'mars']
var gifs = []
var loaded = 0;
var exFrame = 1;
var asteroids = [];
var explosions = [];
var stations = [];
var highlight = null;

// game variables
var lifespan = 50;
var timer = 0;
var spawn = 10;
var current_center = 0;
var recharge = 100;
var station_centers = [
    [0, 0, 0.5, "Alpha", recharge, true],
    [-0.35, 0, -0.35, "Bravo", recharge, true],
    [0.35, 0, -0.35, "Charlie", recharge, true],
    [0, 0, 0, "Earth"]
];
var score = 0;
var station_health = 10;
var earth_health = 50;
var shield_level = 3;
var base_limit = 2;
var frame = 0;
var framerate = 2;
var exploding = 0;
var paused = false;
var apocalypse = false;

var imageContext;

window.onload = function() {
    document.getElementById("score").innerHTML = score;
}

function getScore() {
    return score;
}

// ASSIGNMENT HELPER FUNCTIONS

// get the JSON file from the passed URL
function getJSONFile(url,descr) {
    try {
        if ((typeof(url) !== "string") || (typeof(descr) !== "string"))
            throw "getJSONFile: parameter not a string";
        else {
            var httpReq = new XMLHttpRequest(); // a new http request
            httpReq.open("GET",url,false); // init the request
            httpReq.send(null); // send the request
            var startTime = Date.now();
            while ((httpReq.status !== 200) && (httpReq.readyState !== XMLHttpRequest.DONE)) {
                if ((Date.now()-startTime) > 3000)
                    break;
            } // until its loaded or we time out after three seconds
            if ((httpReq.status !== 200) || (httpReq.readyState !== XMLHttpRequest.DONE))
                throw "Unable to open "+descr+" file!";
            else
                return JSON.parse(httpReq.response); 
        } // end if good params
    } // end try    
    
    catch(e) {
        console.log(e);
        return(String.null);
    }
} // end get input json file

// toggle between existing space stations
function changeStation() {
    if (current_center > base_limit) {
        current_center = 0;
    }
    if (current_center < 0) {
        current_center = base_limit;
    }
    highlight.translation = vec3.fromValues(station_centers[current_center][0], station_centers[current_center][1],
            station_centers[current_center][2]);

    document.getElementById("selected").innerHTML = "Selected Station: " + station_centers[current_center][3];

}

// does stuff when keys are pressed
function handleKeyDown(event) {
    if (!paused) {
        switch (event.code) {
            // switching between space stations
            case "ArrowUp":
                    if (base_limit != -1) {
                        current_center++;
                        changeStation();
                    }
                break;
            case "ArrowDown":
                    if (base_limit != -1) {
                        current_center--;
                        changeStation();
                    }
                break;
            // view change
            case "KeyA": // rotate left across earth
                    var axis = vec3.fromValues(viewMatrix[2], viewMatrix[6], viewMatrix[10]);
                    var right = vec3.create();
                    vec3.cross(right, Up, Center);
                    vec3.cross(axis, right, Up); 
                    mat4.multiply(viewMatrix, mat4.fromRotation(mat4.create(), 0.1, axis), viewMatrix);
                break;
            case "KeyD": // rotate right across earth
                    var axis = vec3.fromValues(viewMatrix[2], viewMatrix[6], viewMatrix[10]);
                    var right = vec3.create();
                    vec3.cross(right, Up, Center);
                    vec3.cross(axis, right, Up);
                    mat4.multiply(viewMatrix, mat4.fromRotation(mat4.create(), -0.1, axis), viewMatrix);
                break;
            case "KeyS": // rotate back around earth
                    var axis = vec3.create();
                    vec3.cross(axis, Up, Center);
                    mat4.multiply(viewMatrix, mat4.fromRotation(mat4.create(), 0.1, axis), viewMatrix);
                break;
            case "KeyW": // rotate forward around earth
                    var axis = vec3.create();
                    vec3.cross(axis, Up, Center);
                    mat4.multiply(viewMatrix, mat4.fromRotation(mat4.create(), -0.1, axis), viewMatrix);
                break;
            case "KeyQ": // turn left above earth
                    mat4.multiply(viewMatrix, mat4.fromRotation(mat4.create(), -0.1, Up), viewMatrix);
                break;
            case "KeyE": // turn right above earth
                    mat4.multiply(viewMatrix, mat4.fromRotation(mat4.create(), 0.1, Up), viewMatrix);
                break;
            case "KeyB": // toggle lighting and blending modes
                blendMode += 1.0;
                if (blendMode > 3.0) {
                    blendMode = 0;
                }
                break;
            case "KeyG":
                finishLoadingTextures();
                break;
            case "Space":
                if (station_centers[current_center][5]) {
                    station_centers[current_center][4] = 0;
                    var snd = new Audio(TEXTURES_URL + "Missile_Launching.mp3");
                    snd.play();
                    generateShot();
                    station_centers[current_center][5] = false;
                    if (station_centers[current_center][3] == 'Alpha') {
                        document.getElementById("station1charge").innerHTML = "Recharging!";
                    } else if (station_centers[current_center][3] == 'Bravo') {
                        document.getElementById("station2charge").innerHTML = "Recharging!";
                    } else if (station_centers[current_center][3] == 'Charlie') {
                        document.getElementById("station3charge").innerHTML = "Recharging!";
                    }
                }
                break;
            case "KeyP":
                if (loaded >= textures.length) {
                    gl.clearColor(0.0, 0.0, 0.0, 1.0);
                    imageContext.clearRect(0,0,1100,650);
                    renderModelsSorted();
                    var snd = new Audio(TEXTURES_URL + "Game_Start.mp3");
                    snd.play();
                    document.getElementById("loading").innerHTML = "";
                    finishLoadingTextures();
                }
                break;
        } // end switch
    }
    switch (event.code) {
        case "KeyR":
            restart();
            document.getElementById("loading").innerHTML = "";
            break;
    }
} // end handleKeyDown

// load the textures
function setupTextures() {
    for (var p in pngs) {
        textures.push({tag: pngs[p], src: pngs[p] + '.png', texture: null})
    }
    for (var j in jpgs) {
        textures.push({tag: jpgs[j], src: jpgs[j] + '.jpg', texture: null})
    }
    for (var g in gifs) {
        textures.push({tag: gifs[g], src: gifs[g] + '.gif', texture: null})
    }

    for (var t in textures) {
        textures[t].texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, textures[t].texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255])); // red placeholder texture
        textures[t].image = new Image();
        textures[t].image.crossOrigin = "anonymous";
        textures[t].image.onload = function() {
            gl.bindTexture(gl.TEXTURE_2D, textures[t].texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // flip image
            //gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textures[t].image);
            loaded++;
            console.log(loaded);
            if (loaded == textures.length) {
                document.getElementById("loading").innerHTML = "Ready to Go!";
                loaded++;
            }
        };

        var fullURL = TEXTURES_URL + textures[t].src;
        textures[t].image.src = fullURL;
        
    }

    finishLoadingTextures(); // not sure why this can't happen in image.onload, but works here...
}

// check if value is a power of 2
function isPowerOf2(value) {
    return (value  != 0) && ((value & (value - 1)) == 0);
}

// finish loading textures
function finishLoadingTextures() {
    for (t in textures) {
        gl.bindTexture(gl.TEXTURE_2D, textures[t].texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textures[t].image);
        setupTextureFilteringAndMips(textures[t].image.width, textures[t].image.height);
    }
}

// setup texture for webgl
function setupTextureFilteringAndMips(width, height) {
    if (isPowerOf2(width) && isPowerOf2(height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
}

// set up the webGL environment
function setupWebGL() {
    
    // Set up keys
    document.onkeydown = handleKeyDown; // call this when key pressed

      // Get the image canvas, render an image in it
     var imageCanvas = document.getElementById("myImageCanvas"); // create a 2d canvas
      var cw = imageCanvas.width, ch = imageCanvas.height; 
      imageContext = imageCanvas.getContext("2d"); 
      var bkgdImage = new Image(); 
      bkgdImage.crossOrigin = "Anonymous";
      bkgdImage.src = TEXTURES_URL + "Game_Start.jpg";
      bkgdImage.onload = function(){
          var iw = bkgdImage.width, ih = bkgdImage.height;
          imageContext.drawImage(bkgdImage,0,0,iw,ih,0,0,cw,ch);   
     } // end onload callback
    
     // create a webgl canvas and set it up
     var webGLCanvas = document.getElementById("myWebGLCanvas"); // create a webgl canvas
     gl = webGLCanvas.getContext("webgl"); // get a webgl object from it
     try {
       if (gl == null) {
         throw "unable to create gl context -- is your browser gl ready?";
       } else {
         //gl.clearColor(0.0, 0.0, 0.0, 1.0); // set bg to black
         gl.clearDepth(1.0); // use max when we clear the depth buffer
         gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
       }
     } // end try
     
     catch(e) {
       console.log(e);
     } // end catch
} // end setupWebGL

// make an ellipsoid, with numLongSteps longitudes.
// start with a sphere of radius 1 at origin
// Returns verts, tris and normals.
function makeEllipsoid(currEllipsoid,numLongSteps) {    
    try {
        if (numLongSteps % 2 != 0)
            throw "in makeSphere: uneven number of longitude steps!";
        else if (numLongSteps < 4)
            throw "in makeSphere: number of longitude steps too small!";
        else { // good number longitude steps
            // make vertices
            var ellipsoidVertices = [0,-1,0]; // vertices to return, init to south pole
            var ellipsoidTextures = [0, 0]; // texture coords to return
            var angleIncr = (Math.PI+Math.PI) / numLongSteps; // angular increment
            var latLimitAngle = angleIncr * (Math.floor(numLongSteps/4)-1); // start/end lat angle
            var latRadius, latY; // radius and Y at current latitude
            var count = 0;
            for (var latAngle = -latLimitAngle; latAngle <= latLimitAngle; latAngle += angleIncr) {
                count = 0;
                latRadius = Math.cos(latAngle); // radius of current latitude
                latY = Math.sin(latAngle); // height at current latitude
                for (var longAngle = 0; longAngle < 2 * Math.PI; longAngle += angleIncr) {// for each long
                    ellipsoidVertices.push(latRadius*Math.sin(longAngle),latY,latRadius*Math.cos(longAngle));
                    ellipsoidTextures.push(longAngle/(2*Math.PI), /*(latLimitAngle + latAngle) / (2 * latLimitAngle));//*/latAngle/Math.PI + 0.5);
                }
                ellipsoidVertices.push(latRadius*Math.sin(0),latY,latRadius*Math.cos(0));
                ellipsoidTextures.push(1, latAngle/Math.PI + 0.5);
            } // end for each latitude
            ellipsoidVertices.push(0,1,0); // add north pole
            ellipsoidTextures.push(0, 1);
            ellipsoidVertices = ellipsoidVertices.map(function(val,idx) { // position and scale ellipsoid
                switch (idx % 3) {
                    case 0: // x
                        return(val*currEllipsoid.a+currEllipsoid.x);
                    case 1: // y
                        return(val*currEllipsoid.b+currEllipsoid.y);
                    case 2: // z
                        return(val*currEllipsoid.c+currEllipsoid.z);
                } // end switch
            });
        
            // make normals using the ellipsoid gradient equation
            // resulting normals are unnormalized: we rely on shaders to normalize
            var ellipsoidNormals = ellipsoidVertices.slice(); // start with a copy of the transformed verts
            ellipsoidNormals = ellipsoidNormals.map(function(val,idx) { // calculate each normal
                switch (idx % 3) {
                    case 0: // x
                        return(2/(currEllipsoid.a*currEllipsoid.a) * (val-currEllipsoid.x));
                    case 1: // y
                        return(2/(currEllipsoid.b*currEllipsoid.b) * (val-currEllipsoid.y));
                    case 2: // z
                        return(2/(currEllipsoid.c*currEllipsoid.c) * (val-currEllipsoid.z));
                } // end switch
            });
                        
            // make triangles, from south pole to middle latitudes to north pole
            var ellipsoidTriangles = []; // triangles to return
            for (var whichLong=1; whichLong<=numLongSteps; whichLong++) // south pole
                ellipsoidTriangles.push(0,whichLong,whichLong+1);
            ellipsoidTriangles.push(0,numLongSteps,1); // longitude wrap tri
            var llVertex; // lower left vertex in the current quad
            for (var whichLat=0; whichLat<(numLongSteps/2 - 2); whichLat++) { // middle lats
                for (var whichLong=0; whichLong<numLongSteps-1; whichLong++) {
                    llVertex = whichLat*numLongSteps + whichLong + 1;
                    ellipsoidTriangles.push(llVertex,llVertex+numLongSteps,llVertex+numLongSteps+1);
                    ellipsoidTriangles.push(llVertex,llVertex+numLongSteps+1,llVertex+1);
                } // end for each longitude
                ellipsoidTriangles.push(llVertex+1,llVertex+numLongSteps+1,llVertex+2);
                ellipsoidTriangles.push(llVertex+1,llVertex+2,llVertex-numLongSteps+2);
            } // end for each latitude
            for (var whichLong = llVertex; whichLong < llVertex + numLongSteps + 1; whichLong++) // north pole
                ellipsoidTriangles.push(whichLong,ellipsoidVertices.length/3-1,whichLong+1);
            ellipsoidTriangles.push(ellipsoidVertices.length/3-2,ellipsoidVertices.length/3-1, ellipsoidVertices.length/3-numLongSteps-1); // longitude wrap
        } // end if good number longitude steps
        return({vertices:ellipsoidVertices, normals:ellipsoidNormals, triangles:ellipsoidTriangles, textures:ellipsoidTextures});
    } // end try
                
    catch(e) {
        console.log(e);
    } // end catch
} // end make ellipsoid

// read models in, load them into webgl buffers
function loadModels() {
    
    inputTriangles = getJSONFile(INPUT_TRIANGLES_URL,"triangles"); // read in the triangle data

    try {
        if (inputTriangles == String.null)
            throw "Unable to load triangles file!";
        else {
            var whichSetVert; // index of vertex in current triangle set
            var whichSetTri; // index of triangle in current triangle set
            var vtxToAdd; // vtx coords to add to the coord array
            var normToAdd; // vtx normal to add to the coord array
            var texToAdd; // vtx texture to add to the texture array
            var uvToAdd; // uv coords to add to the uv arry
            var triToAdd; // tri indices to add to the index array
            var maxCorner = vec3.fromValues(Number.MIN_VALUE,Number.MIN_VALUE,Number.MIN_VALUE); // bbox corner
            var minCorner = vec3.fromValues(Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE); // other corner
        
            // process each triangle set to load webgl vertex and triangle buffers
            numTriangleSets = inputTriangles.length; // remember how many tri sets
            for (var whichSet=0; whichSet<numTriangleSets; whichSet++) { // for each tri set

                inputTriangles[whichSet].index = curInd;
                curInd++;
                
                // set up hilighting, modeling translation and rotation
                inputTriangles[whichSet].center = vec3.fromValues(0,0,0);  // center point of tri set
                inputTriangles[whichSet].on = false; // not highlighted
                inputTriangles[whichSet].translation = vec3.fromValues(0,0,0); // no translation
                inputTriangles[whichSet].xAxis = vec3.fromValues(1,0,0); // model X axis
                inputTriangles[whichSet].yAxis = vec3.fromValues(0,1,0); // model Y axis
                inputTriangles[whichSet].longevity = 0;

                // set up the vertex and normal arrays, define model center and axes
                inputTriangles[whichSet].glVertices = []; // flat coord list for webgl
                inputTriangles[whichSet].glNormals = []; // flat normal list for webgl
                inputTriangles[whichSet].glTextures = []; // flat texture list for webgl
                var numVerts = inputTriangles[whichSet].vertices.length; // num vertices in tri set
                for (whichSetVert=0; whichSetVert<numVerts; whichSetVert++) { // verts in set
                    vtxToAdd = inputTriangles[whichSet].vertices[whichSetVert]; // get vertex to add
                    normToAdd = inputTriangles[whichSet].normals[whichSetVert]; // get normal to add
                    texToAdd = inputTriangles[whichSet].uvs[whichSetVert]; // get uv to add
                    inputTriangles[whichSet].glVertices.push(vtxToAdd[0],vtxToAdd[1],vtxToAdd[2]); // put coords in set coord list
                    inputTriangles[whichSet].glNormals.push(normToAdd[0],normToAdd[1],normToAdd[2]); // put normal in set coord list
                    inputTriangles[whichSet].glTextures.push(texToAdd[0],texToAdd[1]); // put texture in set coord list
                    vec3.max(maxCorner,maxCorner,vtxToAdd); // update world bounding box corner maxima
                    vec3.min(minCorner,minCorner,vtxToAdd); // update world bounding box corner minima
                    vec3.add(inputTriangles[whichSet].center,inputTriangles[whichSet].center,vtxToAdd); // add to ctr sum
                } // end for vertices in set
                vec3.scale(inputTriangles[whichSet].center,inputTriangles[whichSet].center,1/numVerts); // avg ctr sum

                // send the vertex coords and normals to webGL
                vertexBuffers[whichSet] = gl.createBuffer(); // init empty webgl set vertex coord buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(inputTriangles[whichSet].glVertices),gl.STATIC_DRAW); // data in
                normalBuffers[whichSet] = gl.createBuffer(); // init empty webgl set normal component buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(inputTriangles[whichSet].glNormals),gl.STATIC_DRAW); // data in
                textureBuffers[whichSet] = gl.createBuffer(); // init empty webgl set texture component buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,textureBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(inputTriangles[whichSet].glTextures),gl.STATIC_DRAW); // data in
               
                // set up the triangle index array, adjusting indices across sets
                inputTriangles[whichSet].glTriangles = []; // flat index list for webgl
                triSetSizes[whichSet] = inputTriangles[whichSet].triangles.length; // number of tris in this set
                for (whichSetTri=0; whichSetTri<triSetSizes[whichSet]; whichSetTri++) {
                    triToAdd = inputTriangles[whichSet].triangles[whichSetTri]; // get tri to add
                    inputTriangles[whichSet].glTriangles.push(triToAdd[0],triToAdd[1],triToAdd[2]); // put indices in set list
                } // end for triangles in set

                // send the triangle indices to webGL
                triangleBuffers.push(gl.createBuffer()); // init empty triangle index buffer
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(inputTriangles[whichSet].glTriangles),gl.STATIC_DRAW); // data in

            } // end for each triangle set 
        
            inputEllipsoids = getJSONFile(INPUT_ELLIPSOIDS_URL,"ellipsoids"); // read in the ellipsoids

            if (inputEllipsoids == String.null)
                throw "Unable to load ellipsoids file!";
            else {
                
                // init ellipsoid highlighting, translation and rotation; update bbox
                var ellipsoid; // current ellipsoid
                var ellipsoidModel; // current ellipsoid triangular model
                var temp = vec3.create(); // an intermediate vec3
                var minXYZ = vec3.create(), maxXYZ = vec3.create();  // min/max xyz from ellipsoid
                numEllipsoids = inputEllipsoids.length; // remember how many ellipsoids
                for (var whichEllipsoid=0; whichEllipsoid<numEllipsoids; whichEllipsoid++) {
                    
                    // set up various stats and transforms for this ellipsoid
                    ellipsoid = inputEllipsoids[whichEllipsoid];
                    ellipsoid.on = false; // ellipsoids begin without highlight
                    ellipsoid.translation = vec3.fromValues(0,0,0); // ellipsoids begin without translation
                    ellipsoid.xAxis = vec3.fromValues(1,0,0); // ellipsoid X axis
                    ellipsoid.yAxis = vec3.fromValues(0,1,0); // ellipsoid Y axis 
                    ellipsoid.center = vec3.fromValues(ellipsoid.x,ellipsoid.y,ellipsoid.z); // locate ellipsoid ctr
                    ellipsoid.longevity = 0;
                    if (ellipsoid.tag == 'asteroid') {
                        asteroids.push(ellipsoid);
                    }
                    if (ellipsoid.tag == 'highlight') {
                        ellipsoid.translation = vec3.fromValues(station_centers[0][0], station_centers[0][1], station_centers[0][2]);
                        highlight = ellipsoid;
                    }
                    if (ellipsoid.tag == 'station') {
                        stations.push(ellipsoid);
                    }
                    if (ellipsoid.tag == 'moon') {
                        ellipsoid.translation = vec3.fromValues(0, 0, 4);
                    }
                    ellipsoid.index = curInd;
                    curInd++;

                    vec3.set(minXYZ,ellipsoid.x-ellipsoid.a,ellipsoid.y-ellipsoid.b,ellipsoid.z-ellipsoid.c); 
                    vec3.set(maxXYZ,ellipsoid.x+ellipsoid.a,ellipsoid.y+ellipsoid.b,ellipsoid.z+ellipsoid.c); 
                    vec3.min(minCorner,minCorner,minXYZ); // update world bbox min corner
                    vec3.max(maxCorner,maxCorner,maxXYZ); // update world bbox max corner

                    // make the ellipsoid model
                    ellipsoidModel = makeEllipsoid(ellipsoid,32);
                    ellipsoid.glNormals = ellipsoidModel.normals;
                    ellipsoid.glVertices = ellipsoidModel.vertices;
                    ellipsoid.glTextures = ellipsoidModel.textures;
                    ellipsoid.glTriangles = ellipsoidModel.triangles;
    
                    // send the ellipsoid vertex coords and normals to webGL
                    vertexBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid vertex coord buffer
                    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[vertexBuffers.length-1]); // activate that buffer
                    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.vertices),gl.STATIC_DRAW); // data in
                    normalBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid vertex normal buffer
                    gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[normalBuffers.length-1]); // activate that buffer
                    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.normals),gl.STATIC_DRAW); // data in
                    textureBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid texture coord buffer
                    gl.bindBuffer(gl.ARRAY_BUFFER,textureBuffers[textureBuffers.length-1]); // activate that buffer
                    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.textures),gl.STATIC_DRAW); // data in
        
                    triSetSizes.push(ellipsoidModel.triangles.length);
    
                    // send the triangle indices to webGL
                    triangleBuffers.push(gl.createBuffer()); // init empty triangle index buffer
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[triangleBuffers.length-1]); // activate that buffer
                    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(ellipsoidModel.triangles),gl.STATIC_DRAW); // data in
                } // end for each ellipsoid
                
                viewDelta = vec3.length(vec3.subtract(temp,maxCorner,minCorner)) / 100; // set global
            } // end if ellipsoid file loaded
        } // end if triangle file loaded
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end load models

// length between two points in 3D space
function getLength(a, b) {
    return Math.sqrt((Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2) + Math.pow(b[2] - a[2], 2)));
}

// setup the webGL shaders
function setupShaders() {
    
    // define vertex shader in essl using es6 template strings
    var vShaderCode = `
        attribute vec3 aVertexPosition; // vertex position
        attribute vec3 aVertexNormal; // vertex normal
        attribute vec2 aVertexTexture; // vertex texture
        
        uniform mat4 umMatrix; // the model matrix
        uniform mat4 upvmMatrix; // the project view model matrix
        
        varying vec3 vWorldPos; // interpolated world position of vertex
        varying vec3 vVertexNormal; // interpolated normal for frag shader
        varying vec2 vVertexTexture; // interpolated texture for frag shader

        void main(void) {
            
            // vertex position
            vec4 vWorldPos4 = umMatrix * vec4(aVertexPosition, 1.0);
            vWorldPos = vec3(vWorldPos4.x,vWorldPos4.y,vWorldPos4.z);
            gl_Position = upvmMatrix * vec4(aVertexPosition, 1.0);

            // vertex normal (assume no non-uniform scale)
            vec4 vWorldNormal4 = umMatrix * vec4(aVertexNormal, 0.0);
            vVertexNormal = normalize(vec3(vWorldNormal4.x,vWorldNormal4.y,vWorldNormal4.z)); 
            vVertexTexture = aVertexTexture;
        }
    `;
    
    // define fragment shader in essl using es6 template strings
    var fShaderCode = `
        precision mediump float; // set float to medium precision

        // eye location
        uniform vec3 uEyePosition; // the eye's position in world
        
        // light properties
        uniform vec3 uLightAmbient; // the light's ambient color
        uniform vec3 uLightDiffuse; // the light's diffuse color
        uniform vec3 uLightSpecular; // the light's specular color
        uniform vec3 uLightPosition; // the light's position
        
        // material properties
        uniform vec3 uAmbient; // the ambient reflectivity
        uniform vec3 uDiffuse; // the diffuse reflectivity
        uniform vec3 uSpecular; // the specular reflectivity
        uniform float uShininess; // the specular exponent
        uniform float uAlpha; // the alpha value
        uniform float uBlendMode; // the blend mode

        // sampler
        uniform sampler2D uSampler;
        
        // geometry properties
        varying vec3 vWorldPos; // world xyz of fragment
        varying vec3 vVertexNormal; // normal of fragment
        varying vec2 vVertexTexture; // vertex texture (u, v)
            
        void main(void) {
        
            // ambient term
            vec3 ambient = uAmbient*uLightAmbient; 
            
            // diffuse term
            vec3 normal = normalize(vVertexNormal); 
            vec3 light = normalize(uLightPosition - vWorldPos);
            float lambert = max(0.0,dot(normal,light));
            vec3 diffuse = uDiffuse*uLightDiffuse*lambert; // diffuse term
            
            // specular term
            vec3 eye = normalize(uEyePosition - vWorldPos);
            vec3 halfVec = normalize(light+eye);
            float highlight = pow(max(0.0,dot(normal,halfVec)),uShininess);
            vec3 specular = uSpecular*uLightSpecular*highlight; // specular term
            
            // combine to output color
            vec3 colorOut = ambient + diffuse + specular; // no specular yet

            vec4 flatColor = vec4(colorOut, 1.0);
            vec4 texColor = texture2D(uSampler, vec2(vVertexTexture.x, vVertexTexture.y));

            if (uBlendMode == 0.0) {
                gl_FragColor = vec4(texColor.rgb * colorOut, texColor.a * uAlpha);
            }
            if (uBlendMode == 1.0) {
                gl_FragColor = vec4(texColor.rgb, texColor.a * uAlpha);
            }
            if (uBlendMode == 2.0) {
                gl_FragColor = texColor;
            }
            if (uBlendMode == 3.0) {
                gl_FragColor = flatColor;
            }
        }
    `;
    
    try {
        var fShader = gl.createShader(gl.FRAGMENT_SHADER); // create frag shader
        gl.shaderSource(fShader,fShaderCode); // attach code to shader
        gl.compileShader(fShader); // compile the code for gpu execution

        var vShader = gl.createShader(gl.VERTEX_SHADER); // create vertex shader
        gl.shaderSource(vShader,vShaderCode); // attach code to shader
        gl.compileShader(vShader); // compile the code for gpu execution
            
        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) { // bad frag shader compile
            throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);  
            gl.deleteShader(fShader);
        } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) { // bad vertex shader compile
            throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);  
            gl.deleteShader(vShader);
        } else { // no compile errors
            var shaderProgram = gl.createProgram(); // create the single shader program
            gl.attachShader(shaderProgram, fShader); // put frag shader in program
            gl.attachShader(shaderProgram, vShader); // put vertex shader in program
            gl.linkProgram(shaderProgram); // link program into gl context

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { // bad program link
                throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
            } else { // no shader program link errors
                gl.useProgram(shaderProgram); // activate shader program (frag and vert)
                
                // locate and enable vertex attributes
                vPosAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexPosition"); // ptr to vertex pos attrib
                gl.enableVertexAttribArray(vPosAttribLoc); // connect attrib to array
                vNormAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexNormal"); // ptr to vertex normal attrib
                gl.enableVertexAttribArray(vNormAttribLoc); // connect attrib to arrayconsole.log(textures);
                vTexAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexTexture");
                gl.enableVertexAttribArray(vTexAttribLoc);
                
                
                // locate vertex uniforms
                mMatrixULoc = gl.getUniformLocation(shaderProgram, "umMatrix"); // ptr to mmat
                pvmMatrixULoc = gl.getUniformLocation(shaderProgram, "upvmMatrix"); // ptr to pvmmat

                // locate sampler uniform
                samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler"); // ptr to sampler
                
                // locate fragment uniforms
                var eyePositionULoc = gl.getUniformLocation(shaderProgram, "uEyePosition"); // ptr to eye position
                var lightAmbientULoc = gl.getUniformLocation(shaderProgram, "uLightAmbient"); // ptr to light ambient
                var lightDiffuseULoc = gl.getUniformLocation(shaderProgram, "uLightDiffuse"); // ptr to light diffuse
                var lightSpecularULoc = gl.getUniformLocation(shaderProgram, "uLightSpecular"); // ptr to light specular
                var lightPositionULoc = gl.getUniformLocation(shaderProgram, "uLightPosition"); // ptr to light position

                ambientULoc = gl.getUniformLocation(shaderProgram, "uAmbient"); // ptr to ambient
                diffuseULoc = gl.getUniformLocation(shaderProgram, "uDiffuse"); // ptr to diffuse
                specularULoc = gl.getUniformLocation(shaderProgram, "uSpecular"); // ptr to specular
                shininessULoc = gl.getUniformLocation(shaderProgram, "uShininess"); // ptr to shininess
                alphaULoc = gl.getUniformLocation(shaderProgram, "uAlpha"); // ptr to alpha
                lightBlendULoc = gl.getUniformLocation(shaderProgram, "uBlendMode"); // ptr to blend mode
                
                // pass global constants into fragment uniforms
                gl.uniform3fv(eyePositionULoc,Eye); // pass in the eye's position
                gl.uniform3fv(lightAmbientULoc,lightAmbient); // pass in the light's ambient emission
                gl.uniform3fv(lightDiffuseULoc,lightDiffuse); // pass in the light's diffuse emission
                gl.uniform3fv(lightSpecularULoc,lightSpecular); // pass in the light's specular emission
                gl.uniform3fv(lightPositionULoc,lightPosition); // pass in the light's position
            } // end if no shader program link errors
        } // end if no compile errors
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end setup shaders

// function for array sort
function compareNumbers(a, b) {
    return b.depth - a.depth;
}

// sort models by Z-Depth
function sortModels() {
    inputOpaque = new Array();
    inputTranslucent = new Array();
    var center = vec3.create();
    var ray = vec3.create();

    // find and record depth of triangles
    for (tri in inputTriangles) {
        if (inputTriangles[tri].material.alpha == 1.0) {
            inputTriangles[tri].shape = "triangle";
            inputTriangles[tri].whichTriSet = tri;
            inputOpaque.push(inputTriangles[tri]);
        } else {
            inputTriangles[tri].shape = "triangle";
            inputTriangles[tri].whichTriSet = tri;
            vec3.add(center, vec3.fromValues(inputTriangles[tri].center[0], inputTriangles[tri].center[1], inputTriangles[tri].center[2]),
                vec3.fromValues(inputTriangles[tri].translation[0], inputTriangles[tri].translation[1], inputTriangles[tri].translation[2]));
            vec3.subtract(ray, vec3.fromValues(Eye[0], Eye[1], Eye[2]), vec3.fromValues(center[0], center[1], center[2]));
            inputTriangles[tri].depth = Math.abs(ray[2]);
            inputTranslucent.push(inputTriangles[tri]);
        }
    }

    // find and record depth of ellipsoids
    for (s in inputEllipsoids) {
        if(inputEllipsoids[s].alpha == 1.0) {
            inputEllipsoids[s].shape = "ellipsoid";
            inputEllipsoids[s].whichEllipsoid = s;
            inputOpaque.push(inputEllipsoids[s]);
        } else {
            inputEllipsoids[s].shape = "ellipsoid";
            inputEllipsoids[s].whichEllipsoid = s;
            vec3.add(center, vec3.fromValues(inputEllipsoids[s].x, inputEllipsoids[s].y, inputEllipsoids[s].z),
                vec3.fromValues(inputEllipsoids[s].translation[0], inputEllipsoids[s].translation[1], inputEllipsoids[s].translation[2]));
            vec3.subtract(ray, vec3.fromValues(Eye[0], Eye[1], Eye[2]), vec3.fromValues(center[0], center[1], center[2]));
            inputEllipsoids[s].depth = Math.abs(ray[2]);
            inputTranslucent.push(inputEllipsoids[s]);
        }
    }

    inputTranslucent.sort(compareNumbers);
}
    
// find the texture for the model being rendered
function findTexture(model, shape) {
    var modelTex;
    if (shape == "triangle") {
        modelTex = model.material.texture;
    } else {
        modelTex = model.texture;
    }
    for (var t in textures) {
        if (textures[t].src == modelTex) {
            return textures[t];
        }
    }
}

// deletes the model given (currently assumes model is an ellipsoid)
function deleteModel(model) {
    if (model.tag == "asteroid") {
        for (var a in asteroids) {
            if (asteroids[a] == model) {
                asteroids.splice(a, 1);
            }
        }
    }
    for (var e in inputEllipsoids) {
        if (inputEllipsoids[e] == model) {
            inputEllipsoids.splice(e, 1);
        }
    }
}

// get the target for the selected station's shot
function stationTarget(def) {
    var target = vec3.fromValues(def[0], def[1], def[2]);
    var closest = null;
    var dist = 100;
    var temp = 0;
    for (a in asteroids) {
        var aLoc = vec3.add(vec3.create(), vec3.fromValues(asteroids[a].x, asteroids[a].y, asteroids[a].z), asteroids[a].translation);
        temp = getLength(aLoc, def);
        if (temp < dist) {
            dist = temp;
            closest = asteroids[a];
        }
    }
    if (closest !== null) {
        target = vec3.add(vec3.create(), vec3.fromValues(closest.x, closest.y, closest.z), closest.translation);
    }

    return target;
}

// function for generating the shot
function generateShot() {
    var ellipsoid = {};
    var location = station_centers[current_center];
    var target = stationTarget(location);

    ellipsoid.x = location[0]; ellipsoid.y = location[1]; ellipsoid.z = location[2];
    ellipsoid.a = 0.02; ellipsoid.b = 0.02; ellipsoid.c = 0.02;
    ellipsoid.translation = vec3.fromValues(0,0,0); // ellipsoids begin without translation
    ellipsoid.xAxis = vec3.fromValues(1,0,0); // ellipsoid X axis
    ellipsoid.yAxis = vec3.fromValues(0,1,0); // ellipsoid Y axis 
    ellipsoid.center = vec3.fromValues(ellipsoid.x,ellipsoid.y,ellipsoid.z); // locate ellipsoid ctr
    ellipsoid.ambient = [0.5, 0.5, 0.5];
    ellipsoid.diffuse = [0.5, 0.5, 0.5];
    ellipsoid.specular = [0.5, 0.5, 0.5];
    ellipsoid.n = 7;
    ellipsoid.alpha = 1;
    ellipsoid.texture = "shot.png";
    ellipsoid.center = vec3.fromValues(ellipsoid.x,ellipsoid.y,ellipsoid.z);
    ellipsoid.on = false;
    ellipsoid.collider = true;
    ellipsoid.tag = 'shot';
    ellipsoid.longevity = 0;
    ellipsoid.direction = [target[0] - location[0], target[1] - location[1], target[2] - location[2]];
    ellipsoid.index = curInd;
    curInd++

    ellipsoidModel = makeEllipsoid(ellipsoid,32);
    ellipsoid.glNormals = ellipsoidModel.normals;
    ellipsoid.glVertices = ellipsoidModel.vertices;
    ellipsoid.glTextures = ellipsoidModel.textures;
    ellipsoid.glTriangles = ellipsoidModel.triangles;

    inputEllipsoids.push(ellipsoid);

    // send the ellipsoid vertex coords and normals to webGL
    vertexBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid vertex coord buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[vertexBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.vertices),gl.STATIC_DRAW); // data in
    normalBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid vertex normal buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[normalBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.normals),gl.STATIC_DRAW); // data in
    textureBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid texture coord buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,textureBuffers[textureBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.textures),gl.STATIC_DRAW); // data in

    triSetSizes.push(ellipsoidModel.triangles.length);

    // send the triangle indices to webGL
    triangleBuffers.push(gl.createBuffer()); // init empty triangle index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[triangleBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(ellipsoidModel.triangles),gl.STATIC_DRAW); // data in
}

// finds a random location on the surface of a sphere with center at x,y,z and radius
function getSpotOnSphere(x, y, z, radius) {
    var u = Math.random();
    var v = Math.random();
    var theta = 2 * Math.PI * u;
    var phi = Math.acos(2 * v - 1);
    var xx = x + (radius * Math.sin(phi) * Math.cos(theta));
    var yy = y + (radius * Math.sin(phi) * Math.sin(theta));
    var zz = z + (radius * Math.cos(phi));
    return [xx, yy, zz];
}

// finds the closest target for a spawning asteroid
function getAsteroidTarget(spawnLocation) {
    var closest = [0,0,0];
    var dist = 100;
    var temp = 0;
    for (t in station_centers) {
        temp = vec3.length(vec3.subtract(vec3.create(), vec3.fromValues(station_centers[t][0], station_centers[t][1],
            station_centers[t][2]), vec3.fromValues(spawnLocation[0], spawnLocation[1], spawnLocation[2])));
        if (temp < dist) {
            dist = temp;
            closest = station_centers[t];
        }
    }
    return closest;
}

// spawn an asteroid
function generateAsteroid() {
    var spawnLocation = getSpotOnSphere(0, 0, 0, 10);
    var target = getAsteroidTarget(spawnLocation);

    // initialize ellipse
    var ellipsoid = {};
    ellipsoid.x = spawnLocation[0]; ellipsoid.y = spawnLocation[1]; ellipsoid.z = spawnLocation[2];
    ellipsoid.a = Math.random() * 0.03 + 0.01;
    ellipsoid.b = Math.random() * 0.03 + 0.01;
    ellipsoid.c = Math.random() * 0.03 + 0.01;

    ellipsoid.translation = vec3.fromValues(0,0,0); // ellipsoids begin without translation
    ellipsoid.xAxis = vec3.fromValues(1,0,0); // ellipsoid X axis
    ellipsoid.yAxis = vec3.fromValues(0,1,0); // ellipsoid Y axis 
    ellipsoid.center = vec3.fromValues(ellipsoid.x,ellipsoid.y,ellipsoid.z); // locate ellipsoid ctr
    ellipsoid.ambient = [0.5, 0.5, 0.5];
    ellipsoid.diffuse = [0.5, 0.5, 0.5];
    ellipsoid.specular = [0.5, 0.5, 0.5];
    ellipsoid.n = 7;
    ellipsoid.alpha = 1;
    ellipsoid.texture = "asteroid.jpg";
    ellipsoid.on = false;
    ellipsoid.tag = 'asteroid';
    ellipsoid.collider = true;
    ellipsoid.longevity = 0;
    ellipsoid.direction = vec3.subtract(vec3.create(), vec3.fromValues(target[0], target[1], target[2]),
        vec3.fromValues(ellipsoid.x, ellipsoid.y, ellipsoid.z));
    //ellipsoid.rotation = add random rotation?

    ellipsoid.index = curInd;
    curInd++;

    ellipsoidModel = makeEllipsoid(ellipsoid,32);
    ellipsoid.glNormals = ellipsoidModel.normals;
    ellipsoid.glVertices = ellipsoidModel.vertices;
    ellipsoid.glTextures = ellipsoidModel.textures;
    ellipsoid.glTriangles = ellipsoidModel.triangles;

    inputEllipsoids.push(ellipsoid);
    asteroids.push(ellipsoid);

    // send the ellipsoid vertex coords and normals to webGL
    vertexBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid vertex coord buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[vertexBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.vertices),gl.STATIC_DRAW); // data in
    normalBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid vertex normal buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[normalBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.normals),gl.STATIC_DRAW); // data in
    textureBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid texture coord buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,textureBuffers[textureBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.textures),gl.STATIC_DRAW); // data in

    triSetSizes.push(ellipsoidModel.triangles.length);

    // send the triangle indices to webGL
    triangleBuffers.push(gl.createBuffer()); // init empty triangle index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[triangleBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(ellipsoidModel.triangles),gl.STATIC_DRAW); // data in
}

// spawn incr timer, spawn asteroid if timer == spawn, reset timer, randomize next spawn time limit
function updateAsteroids() {
    timer++;
    if (timer >= spawn && !paused) {
        generateAsteroid();
        timer = 0;
        spawn = Math.floor(Math.random() * (500 - 400 + 1) + 500);   // set spawn to random number between 5 and 10
    }
}

// create an explosion at a given location, increase size if boom
function generateExplosion(location, boom) {
    var spawnLocation = location;
    var snd = new Audio(TEXTURES_URL + "Explosion.mp3");
    snd.play();

    //initialize the ellipsoid
    var ellipsoid = {};
    ellipsoid.x = spawnLocation[0]; ellipsoid.y = spawnLocation[1]; ellipsoid.z = spawnLocation[2];
    ellipsoid.a = Math.random() * 0.075 + 0.025;
    ellipsoid.b = Math.random() * 0.075 + 0.025;
    ellipsoid.c = Math.random() * 0.075 + 0.025;
    if (boom) {
        ellipsoid.a = 0.5; ellipsoid.b = 0.5; ellipsoid.c = 0.5;
    }

    ellipsoid.translation = vec3.fromValues(0,0,0); // ellipsoids begin without translation
    ellipsoid.xAxis = vec3.fromValues(1,0,0); // ellipsoid X axis
    ellipsoid.yAxis = vec3.fromValues(0,1,0); // ellipsoid Y axis 
    ellipsoid.center = vec3.fromValues(ellipsoid.x,ellipsoid.y,ellipsoid.z); // locate ellipsoid ctr
    ellipsoid.ambient = [0.6, 0.6, 0.6];
    ellipsoid.diffuse = [0.8, 0.8, 0.8];
    ellipsoid.specular = [0.6, 0.6, 0.6];
    ellipsoid.n = 7;
    ellipsoid.alpha = 0.8;
    ellipsoid.texture = "explosion1.png";
    ellipsoid.exFrame = 1;
    ellipsoid.on = false;
    ellipsoid.tag = 'explosion';
    ellipsoid.collider = false;
    ellipsoid.longevity = 0;
    ellipsoid.direction = vec3.fromValues(0,0,0);
    //ellipsoid.rotation = add random rotation?

    ellipsoid.index = curInd;
    curInd++;

    ellipsoidModel = makeEllipsoid(ellipsoid,32);
    ellipsoid.glNormals = ellipsoidModel.normals;
    ellipsoid.glVertices = ellipsoidModel.vertices;
    ellipsoid.glTextures = ellipsoidModel.textures;
    ellipsoid.glTriangles = ellipsoidModel.triangles;

    inputEllipsoids.push(ellipsoid);
    explosions.push(ellipsoid);

    // send the ellipsoid vertex coords and normals to webGL
    vertexBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid vertex coord buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[vertexBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.vertices),gl.STATIC_DRAW); // data in
    normalBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid vertex normal buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[normalBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.normals),gl.STATIC_DRAW); // data in
    textureBuffers.push(gl.createBuffer()); // init empty webgl ellipsoid texture coord buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,textureBuffers[textureBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(ellipsoidModel.textures),gl.STATIC_DRAW); // data in

    triSetSizes.push(ellipsoidModel.triangles.length);

    // send the triangle indices to webGL
    triangleBuffers.push(gl.createBuffer()); // init empty triangle index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[triangleBuffers.length-1]); // activate that buffer
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(ellipsoidModel.triangles),gl.STATIC_DRAW); // data in
}

// animate the explosion sprites
function animateExplosion(model) {
    frame++;
    
    if (frame > framerate) {

        model.exFrame++;
        if (model.exFrame == 8) {
            //finish explosion
            for (var e in explosions) {
                if (explosions[e] == model) {
                    explosions.splice(e, 1);
                }
            }
            deleteModel(model);
        } else {
            if (model.shape == "triangle") {
                //model.material.texture = "explosion" + model.exFrame + ".png";
            } else {
                model.texture = "explosion" + model.exFrame + ".png";
            }
    
            frame = 0;
        }
    }
}

function endgameScreen() {
    var bkgdImage = new Image(); 
    bkgdImage.crossOrigin = "Anonymous";
    bkgdImage.src = TEXTURES_URL + "Game_End.jpg";
    bkgdImage.onload = function(){
        var iw = bkgdImage.width, ih = bkgdImage.height;
        imageContext.drawImage(bkgdImage,0,0,iw,ih,0,0,1150,650);  
    }
}

// blow up the earth for game over
function explodeEarth(earth) {
    if (exploding < 300) {
        console.log("Exploding");
        var location = getSpotOnSphere(earth.x, earth.y, earth.z, earth.a);
        generateExplosion(location, false);
    } else if (exploding == 300) {
        var location = vec3.fromValues(0,0,0);
        generateExplosion(location, true);
    } else {
        deleteModel(earth);
        endgameScreen();
    }
}

// game over
function gameOver(earth) {

    for (var a in asteroids) {
        deleteModel(asteroids[a]);
    }
    for (var s in stations) {
        deleteModel(stations[s]);
    }
    for (var e in inputEllipsoids) {
        if (inputEllipsoids[e].tag == 'shield') {
            deleteModel(inputEllipsoids[e]);
        }
    }
    deleteModel(highlight);
    apocalypse = true;
    paused = true;
    document.getElementById("loading").innerHTML = "Game Over!";
}

// look for collision between asteroids and other objects
function checkCollision(a, b) {
    if (a !== undefined && b !== undefined) {
        var aRad = (a.a + a.b + a.c) / 3;
        var bRad = (b.a + b.b + b.c) / 3;
        var aPos = vec3.create();

        vec3.add(aPos, a.center, a.translation);
        var bPos = vec3.create();
        vec3.add(bPos, b.center, b.translation);
        var dist = vec3.distance(aPos, bPos);

        if (dist < aRad + bRad) {
            //spawn explosion and destroy asteroid, doesn't matter what asteroid collided with, always explodes
            generateExplosion(vec3.add(vec3.create(), vec3.fromValues(a.x, a.y, a.z),
                vec3.fromValues(a.translation[0], a.translation[1], a.translation[2])), false);
            deleteModel(a);
            //handle collision
            if (b.tag == 'shot') {
                // destroy asteroid and shot, give player points
                //test *******apocalypse = true;
                //test *******gameOver(b);
                deleteModel(b);
                score += 10;
                document.getElementById("score").innerHTML = "Score: " + score;
            } else if (b.tag == 'station') {
                // destroy asteroid, damage station and destroy if life < 0 then weaken shield
                // if last station destroyed, destroy shield as wells
                b.health -= 5;
                if (b.css == 'station1') {
                    document.getElementById("station1").innerHTML = "Station Alpha: " + b.health;
                } else if (b.css == 'station2') {
                    document.getElementById("station2").innerHTML = "Station Bravo: " + b.health;
                } else {
                    document.getElementById("station3").innerHTML = "Station Charlie: " + b.health;
                }
                if (b.health == 0) {
                    var change = false;
                    base_limit--;
                    // reduce shield alpha by one to signify weakening
                    for (var o in inputEllipsoids) {
                        if (inputEllipsoids[o].tag == 'shield') {
                            inputEllipsoids[o].alpha -= 0.2;
                        }
                    }
                    // if the destroyed center is highlighted, switch to next
                    if (b.id == current_center) {
                        for (var s in stations) {
                            if (stations[s].id > b.id) {
                                stations[s].id--;
                            }
                        }
                        change = true;
                    }
                    // remove the destroyed station
                    station_centers.splice(b.id, 1);
                    deleteModel(b);
                    // has to be after splice/delete or else will access out of date station_centers
                    if (change) {
                        current_center++;
                        changeStation();
                    }
                    shield_level--;
                    document.getElementById("shield").innerHTML = "Shield: " + shield_level;
                    // destroy shield if no more stations
                    if (shield_level == 0) {
                        for (var o in inputEllipsoids) {
                            if (inputEllipsoids[o].tag == 'shield') {
                                deleteModel(inputEllipsoids[o]);
                                break;
                            }
                        }
                        deleteModel(highlight);
                    }
                    if (b.css == 'station1') {
                        document.getElementById("station1charge").innerHTML = "Destroyed!";
                        document.getElementById("station1").innerHTML = "Station Alpha:"
                    } else if (b.css == 'station2') {
                        document.getElementById("station2charge").innerHTML = "Destroyed!";
                        document.getElementById("station2").innerHTML = "Station Bravo:"
                    } else {
                        document.getElementById("station3charge").innerHTML = "Destroyed!";
                        document.getElementById("station3").innerHTML = "Station Charlie:"
                    }
                }
            } else if (b.tag == 'shield') {
                // destroy asteroid, damage earth based on shield strength
                earth_health -= 15 / shield_level;
                document.getElementById("earth").innerHTML = "Earth: " + earth_health;
                console.log("Shield hit, but holding strong! Health: " + earth_health);
                if (earth_health <= 0) {
                    for (var o in inputEllipsoids) {
                        if (inputEllipsoids[o].tag == 'earth') {
                            // handle game over
                            gameOver(inputEllipsoids[o]);
                            break;
                        }
                    }
                }
            } else if (b.tag == 'earth') {
                // destroy asteroid, damage earth and destroy if life < 0
                earth_health -= 15;
                document.getElementById("earth").innerHTML = "Earth: " + earth_health;
                console.log("Direct hit! Health: " + earth_health);
                if (earth_health <= 0) {
                    // handle game over
                    gameOver(b);
                }
            } else if (b.tag == 'moon') {
                b.health -= 5;
                if (b.health <= 0) {
                    generateExplosion(vec3.add(vec3.create(), vec3.fromValues(b.x, b.y, b.z),
                        vec3.fromValues(b.translation[0], b.translation[1], b.translation[2])), true);
                    deleteModel(b);
                }
            }
        }
    }
}

// recharge stations that need to shoot
function rechargeStations() {
    for (s in station_centers) {
        if (station_centers[s][4] < recharge) {
            station_centers[s][4]++;
        } else if (station_centers[s][4] == recharge) {
            station_centers[s][5] = true;
            if (station_centers[s][3] == 'Alpha') {
                document.getElementById("station1charge").innerHTML = "Ready to Fire!";
            } else if (station_centers[s][3] == 'Bravo') {
                document.getElementById("station2charge").innerHTML = "Ready to Fire!";
            } else if (station_centers[s][3] == 'Charlie') {
                document.getElementById("station3charge").innerHTML = "Ready to Fire!";
            }
        }
    }
}

// function for running updates on objects where needed
function updateModels() {
    for (var m in inputOpaque) {
        if (inputOpaque[m] !== undefined) {
            if (inputOpaque[m].tag == 'shot') {
                // move forward along z some amount
                // update longevity
                vec3.add(inputOpaque[m].translation, inputOpaque[m].translation, vec3.scale(vec3.create(), inputOpaque[m].direction, 0.01));
                inputOpaque[m].longevity += 0.1;
                if (inputOpaque[m].longevity > lifespan) {
                    // delete inputOpaque[m]
                    deleteModel(inputOpaque[m]);
                }
            } else
            if (inputOpaque[m].tag == 'asteroid') {
                vec3.add(inputOpaque[m].translation, inputOpaque[m].translation, vec3.scale(vec3.create(), inputOpaque[m].direction, 0.001));
                inputOpaque[m].longevity += 0.0005;
                if (inputOpaque[m].longevity > lifespan) {
                    // delete inputOpaque[m]
                    deleteModel(inputOpaque[m]);
                }
            }
            if (inputOpaque[m].tag == 'moon') {
                vec3.rotateY(inputOpaque[m].translation, inputOpaque[m].translation,
                    vec3.fromValues(0,0,0), .001);
            }
        }
    }
    for (var m in inputTranslucent) {
        if (inputTranslucent[m] !== undefined) {
            if (inputTranslucent[m].tag == 'shot') {
                // move forward along z some amount
                // update longevity
                vec3.add(inputTranslucent[m].translation, inputTranslucent[m].translation, vec3.scale(vec3.create(),
                    inputTranslucent[m].direction, 0.1));
                inputTranslucent[m].longevity++;
                if (inputTranslucent[m].longevity > lifespan) {
                    // delete inputOpaque[m]
                    deleteModel(inputTranslucent[m]);
                }
            }
        }
    }
}

// render the models sorted by model depth
function renderModelsSorted() {

    sortModels();

    if (loaded == textures.length) {
        finishLoadingTextures();
        document.getElementById("loading").innerHTML = "Ready to Go!";
        loaded++;
    }

    // check collisions
    for (a in asteroids) {
        for (n in inputEllipsoids) {
            if (asteroids[a] !== inputEllipsoids[n] && inputEllipsoids[n].collider) {
                checkCollision(asteroids[a], inputEllipsoids[n]);
            }
        }
    }

    // update explosions
    for (var e in explosions) {
        animateExplosion(explosions[e]);
    }

    // if apocalypse
    if (apocalypse) {
        for (var e in inputEllipsoids) {
            if (inputEllipsoids[e].tag == 'earth') {
                explodeEarth(inputEllipsoids[e]);
            }
        }
        exploding++;
    }

    // recharge shooting for stations
    rechargeStations();

    // update models
    updateModels();

    // tick asteroids
    updateAsteroids();

    // construct the model transform matrix, based on model state
    function makeModelTransform(currModel) {
        var zAxis = vec3.create(), sumRotation = mat4.create(), temp = mat4.create(), negCtr = vec3.create();

        // move the model to the origin
        mat4.fromTranslation(mMatrix,vec3.negate(negCtr,currModel.center)); 
        
        // scale for highlighting if needed
        if (currModel.on)
            mat4.multiply(mMatrix,mat4.fromScaling(temp,vec3.fromValues(1.2,1.2,1.2)),mMatrix); // S(1.2) * T(-ctr)
        
        // rotate the model to current interactive orientation
        vec3.normalize(zAxis,vec3.cross(zAxis,currModel.xAxis,currModel.yAxis)); // get the new model z axis
        mat4.set(sumRotation, // get the composite rotation
            currModel.xAxis[0], currModel.yAxis[0], zAxis[0], 0,
            currModel.xAxis[1], currModel.yAxis[1], zAxis[1], 0,
            currModel.xAxis[2], currModel.yAxis[2], zAxis[2], 0,
            0, 0,  0, 1);
        mat4.multiply(mMatrix,sumRotation,mMatrix); // R(ax) * S(1.2) * T(-ctr)
        
        // translate back to model center
        mat4.multiply(mMatrix,mat4.fromTranslation(temp,currModel.center),mMatrix); // T(ctr) * R(ax) * S(1.2) * T(-ctr)

        // translate model to current interactive orientation
        mat4.multiply(mMatrix,mat4.fromTranslation(temp,currModel.translation),mMatrix); // T(pos)*T(ctr)*R(ax)*S(1.2)*T(-ctr)
        
    } // end make model transform
    
    // var hMatrix = mat4.create(); // handedness matrix
    var pMatrix = mat4.create(); // projection matrix
    var vMatrix = mat4.create(); // view matrix
    var mMatrix = mat4.create(); // model matrix
    var pvMatrix = mat4.create(); // hand * proj * view matrices
    var pvmMatrix = mat4.create(); // hand * proj * view * model matrices
    
    window.requestAnimationFrame(renderModelsSorted); // set up frame render callback
    
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers
    
    // set up projection and view
    // mat4.fromScaling(hMatrix,vec3.fromValues(-1,1,1)); // create handedness matrix
    mat4.perspective(pMatrix,0.5*Math.PI,1,0.1,100); // create projection matrix
    mat4.lookAt(vMatrix,Eye,Center,Up); // create view matrix
    mat4.multiply(vMatrix,vMatrix,viewMatrix); // create view matrix
    mat4.multiply(pvMatrix,pvMatrix,pMatrix); // projection
    mat4.multiply(pvMatrix,pvMatrix,vMatrix); // projection * view

    gl.enable(gl.BLEND);
    gl.blendEquation( gl.FUNC_ADD );
    gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
    gl.depthMask(true);
    gl.uniform1f(lightBlendULoc, blendMode); // pass in the blend mode

    // render each model
    var currSet;
    var currTex;

    for (var m in inputOpaque) {
        if (inputOpaque[m].shape == "triangle") {
            // render triangle

            // find texture
            currSet = inputOpaque[m];
            currTex = findTexture(currSet, inputOpaque[m].shape);

            // make model transform, add to view project
            makeModelTransform(currSet);
            mat4.multiply(pvmMatrix,pvMatrix,mMatrix); // project * view * model
            gl.uniformMatrix4fv(mMatrixULoc, false, mMatrix); // pass in the m matrix
            gl.uniformMatrix4fv(pvmMatrixULoc, false, pvmMatrix); // pass in the hpvm matrix
            
            // reflectivity: feed to the fragment shader
            gl.uniform3fv(ambientULoc,currSet.material.ambient); // pass in the ambient reflectivity
            gl.uniform3fv(diffuseULoc,currSet.material.diffuse); // pass in the diffuse reflectivity
            gl.uniform3fv(specularULoc,currSet.material.specular); // pass in the specular reflectivity
            gl.uniform1f(shininessULoc,currSet.material.n); // pass in the specular exponent
            gl.uniform1f(alphaULoc,currSet.material.alpha); // pass in the alpha value
            
            // vertex buffer: activate and feed into vertex shader
            gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[inputOpaque[m].index]); // activate
            gl.vertexAttribPointer(vPosAttribLoc,3,gl.FLOAT,false,0,0); // feed
            gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[inputOpaque[m].index]); // activate
            gl.vertexAttribPointer(vNormAttribLoc,3,gl.FLOAT,false,0,0); // feed
            gl.bindBuffer(gl.ARRAY_BUFFER,textureBuffers[inputOpaque[m].index]); // activate
            gl.vertexAttribPointer(vTexAttribLoc,2,gl.FLOAT,false,0,0); // feed

            // activate texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, currTex.texture);
            gl.uniform1i(samplerUniform, 0);

            // triangle buffer: activate and render
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffers[inputOpaque[m].index]); // activate
            gl.drawElements(gl.TRIANGLES,3*triSetSizes[inputOpaque[m].index],gl.UNSIGNED_SHORT,0); // render
        } else {
            // render ellipsoid
            var ellipsoid, instanceTransform = mat4.create(); // the current ellipsoid and material
            ellipsoid = inputOpaque[m];
            var ind = numTriangleSets+parseInt(inputOpaque[m].whichEllipsoid);
            var index = inputOpaque[m].index;

            // find texture
            currTex = findTexture(ellipsoid, inputOpaque[m].shape);
                
            // define model transform, premult with pvmMatrix, feed to vertex shader
            makeModelTransform(ellipsoid);
            pvmMatrix = mat4.multiply(pvmMatrix,pvMatrix,mMatrix); // premultiply with pv matrix
            gl.uniformMatrix4fv(mMatrixULoc, false, mMatrix); // pass in model matrix
            gl.uniformMatrix4fv(pvmMatrixULoc, false, pvmMatrix); // pass in project view model matrix
        
            // reflectivity: feed to the fragment shader
            gl.uniform3fv(ambientULoc,ellipsoid.ambient); // pass in the ambient reflectivity
            gl.uniform3fv(diffuseULoc,ellipsoid.diffuse); // pass in the diffuse reflectivity
            gl.uniform3fv(specularULoc,ellipsoid.specular); // pass in the specular reflectivity
            gl.uniform1f(shininessULoc,ellipsoid.n); // pass in the specular exponent
            gl.uniform1f(alphaULoc,ellipsoid.alpha); // pass in the alpha value

            gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[index]); // activate vertex buffer
            gl.vertexAttribPointer(vPosAttribLoc,3,gl.FLOAT,false,0,0); // feed vertex buffer to shader
            gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[index]); // activate normal buffer
            gl.vertexAttribPointer(vNormAttribLoc,3,gl.FLOAT,false,0,0); // feed normal buffer to shader
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffers[index]); // activate tri buffer
            gl.bindBuffer(gl.ARRAY_BUFFER,textureBuffers[index]); // activate
            gl.vertexAttribPointer(vTexAttribLoc,2,gl.FLOAT,false,0,0); // feed
        
            // activate texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, currTex.texture);
            gl.uniform1i(samplerUniform, 0)
                
            // draw a transformed instance of the ellipsoid
            gl.drawElements(gl.TRIANGLES,triSetSizes[index],gl.UNSIGNED_SHORT,0); // render
        }
    }

    gl.depthMask(false);

    for (var m in inputTranslucent) {
        if (inputTranslucent[m].shape == "triangle") {
            // render triangle
            // find texture
            currSet = inputTranslucent[m];
            currTex = findTexture(currSet, inputTranslucent[m].shape);

            // make model transform, add to view project
            makeModelTransform(currSet);
            mat4.multiply(pvmMatrix,pvMatrix,mMatrix); // project * view * model
            gl.uniformMatrix4fv(mMatrixULoc, false, mMatrix); // pass in the m matrix
            gl.uniformMatrix4fv(pvmMatrixULoc, false, pvmMatrix); // pass in the hpvm matrix
            
            // reflectivity: feed to the fragment shader
            gl.uniform3fv(ambientULoc,currSet.material.ambient); // pass in the ambient reflectivity
            gl.uniform3fv(diffuseULoc,currSet.material.diffuse); // pass in the diffuse reflectivity
            gl.uniform3fv(specularULoc,currSet.material.specular); // pass in the specular reflectivity
            gl.uniform1f(shininessULoc,currSet.material.n); // pass in the specular exponent
            gl.uniform1f(alphaULoc,currSet.material.alpha); // pass in the alpha value
            
            // vertex buffer: activate and feed into vertex shader
            gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[inputTranslucent[m].index]); // activate
            gl.vertexAttribPointer(vPosAttribLoc,3,gl.FLOAT,false,0,0); // feed
            gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[inputTranslucent[m].index]); // activate
            gl.vertexAttribPointer(vNormAttribLoc,3,gl.FLOAT,false,0,0); // feed
            gl.bindBuffer(gl.ARRAY_BUFFER,textureBuffers[inputTranslucent[m].index]); // activate
            gl.vertexAttribPointer(vTexAttribLoc,2,gl.FLOAT,false,0,0); // feed

            // activate texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, currTex.texture);
            gl.uniform1i(samplerUniform, 0)

            // triangle buffer: activate and render
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffers[inputTranslucent[m].index]); // activate
            gl.drawElements(gl.TRIANGLES,3*triSetSizes[inputTranslucent[m].index],gl.UNSIGNED_SHORT,0); // render
        } else {
            // render ellipsoid
            var ellipsoid, instanceTransform = mat4.create(); // the current ellipsoid and material
            ellipsoid = inputTranslucent[m];
            var ind = numTriangleSets+parseInt(inputTranslucent[m].whichEllipsoid);
            var index = inputTranslucent[m].index;

            // find texture
            currTex = findTexture(ellipsoid, inputTranslucent[m].shape);
                
            // define model transform, premult with pvmMatrix, feed to vertex shader
            makeModelTransform(ellipsoid);
            pvmMatrix = mat4.multiply(pvmMatrix,pvMatrix,mMatrix); // premultiply with pv matrix
            gl.uniformMatrix4fv(mMatrixULoc, false, mMatrix); // pass in model matrix
            gl.uniformMatrix4fv(pvmMatrixULoc, false, pvmMatrix); // pass in project view model matrix
        
            // reflectivity: feed to the fragment shader
            gl.uniform3fv(ambientULoc,ellipsoid.ambient); // pass in the ambient reflectivity
            gl.uniform3fv(diffuseULoc,ellipsoid.diffuse); // pass in the diffuse reflectivity
            gl.uniform3fv(specularULoc,ellipsoid.specular); // pass in the specular reflectivity
            gl.uniform1f(shininessULoc,ellipsoid.n); // pass in the specular exponent
            gl.uniform1f(alphaULoc,ellipsoid.alpha); // pass in the alpha value

            gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[index]); // activate vertex buffer
            gl.vertexAttribPointer(vPosAttribLoc,3,gl.FLOAT,false,0,0); // feed vertex buffer to shader
            gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[index]); // activate normal buffer
            gl.vertexAttribPointer(vNormAttribLoc,3,gl.FLOAT,false,0,0); // feed normal buffer to shader
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffers[index]); // activate tri buffer
            gl.bindBuffer(gl.ARRAY_BUFFER,textureBuffers[index]); // activate
            gl.vertexAttribPointer(vTexAttribLoc,2,gl.FLOAT,false,0,0); // feed
        
            // activate texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, currTex.texture);
            gl.uniform1i(samplerUniform, 0)
                
            // draw a transformed instance of the ellipsoid
            gl.drawElements(gl.TRIANGLES,triSetSizes[index],gl.UNSIGNED_SHORT,0); // render
        }
    }
}

// restart the game
function restart() {
    inputTriangles = []; // the triangle data as loaded from input files
    numTriangleSets = 0; // how many triangle sets in input scene
    inputEllipsoids = []; // the ellipsoid data as loaded from input files
    numEllipsoids = 0; // how many ellipsoids in the input scene
    inputOpaque = new Array(); // opaque models
    inputTranslucent = new Array(); // translucent models
    inputModels = new Array(); // models sorted by depth
    inputTrianglesSorted = new Array(); // triangles sorted by depth
    viewMatrix = mat4.create();
    
    curInd = 0;
    
    vertexBuffers = []; // this contains vertex coordinate lists by set, in triples
    normalBuffers = []; // this contains normal component lists by set, in triples
    textureBuffers = []; // this contains texture uv lists by vertex, in doubles
    triSetSizes = []; // this contains the size of each triangle set
    triangleBuffers = []; // lists of indices into vertexBuffers by set, in triples

    asteroids = [];
    explosions = [];
    stations = [];
    highlight = null;

    // game variables
    timer = 0;
    spawn = 10;
    station_centers = [
        [0, 0, 0.5, "Alpha", 50, true],
        [-0.35, 0, -0.35, "Bravo", 50, true],
        [0.35, 0, -0.35, "Charlie", 50, true]
    ];
    current_center = 0;

    score = 0;
    earth_health = 50;
    shield_level = 3;
    base_limit = 2;
    frame = 0;
    framerate = 2;
    exploding = 0;
    paused = false;
    apocalypse = false;

    document.getElementById("station1").innerHTML = "Station Alpha: 10";
    document.getElementById("station2").innerHTML = "Station Bravo: 10";
    document.getElementById("station3").innerHTML = "Station Charlie: 10";
    document.getElementById("score").innerHTML = "Score: " + score;
    document.getElementById("shield").innerHTML = "Shield: " + shield_level;
    document.getElementById("earth").innerHTML = "Earth: " + earth_health;
    document.getElementById("selected").innerHTML = "Selected Station: Alpha";
    document.getElementById("station1charge").innerHTML = "Ready to Fire!";
    document.getElementById("station2charge").innerHTML = "Ready to Fire!";
    document.getElementById("station3charge").innerHTML = "Ready to Fire!";
    
    loadModels();
    var snd = new Audio(TEXTURES_URL + "Game_Start.mp3");
    snd.play();
}

/* MAIN -- HERE is where execution begins after window load */

function main() {
    setupWebGL(); // set up the webGL environment
    setupTextures(); // load textures
    loadModels(); // load in the models from tri file
    var snd2 = new Audio(TEXTURES_URL + "Game_Music.mp3");
    snd2.addEventListener('ended', function() {
        this.currentTime = 0;
        this.play();
    }, false);
    snd2.play();
    setupShaders(); // setup the webGL shaders
    
  
} // end main
