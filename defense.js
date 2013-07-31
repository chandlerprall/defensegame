(function(){
    function Vector( x, y ) {
        this.x = x;
        this.y = y;
    }
    Vector.prototype.distanceTo = function( v ) {
        var dx = this.x - v.x, dy = this.y - v.y;
        return Math.sqrt( dx * dx + dy * dy );
    };
	Vector.prototype.set = function( x, y ) {
		this.x = x;
		this.y = y;
	};
	Vector.prototype.normalize = function() {
		var length = Math.sqrt( this.x * this.x + this.y * this.y );
		this.x /= length;
		this.y /= length;
	};
	window.Vector = Vector;

    function SpriteSheet( path, frame_size, frame_count, animation_speed ) {
        this.image = new Image();
        this.image.src = path;

        this.frame_size = frame_size; // What is the image size of each frame
        this.frame_count = frame_count; // How many frames per orientation
        this.animation_speed = animation_speed; // Speed at which the animation progresses
    }

    function Sprite( sprite_sheet ) {
        this.sheet = sprite_sheet;
        this.current_frame = 0;
        this.last_frame_update = null;
    }

    function Entity( sprite, position ) {
        if ( sprite !== undefined ) {
			this.sprite = sprite;
			this.position = position;
			this.orientation = 0; // Default to "up"
		}
    }

    function Enemy() {
        var starting_position = new Vector(
                ( start_tile[0] + 1 ) * tile_size - ( tile_size / 2 ), // Center of the tile horizontally
                ( start_tile[1] + 1 ) * tile_size - ( tile_size / 2 ) // Center of the tile vertically
            ),
            sprite = new Sprite( spritesheets.enemy );

        Entity.call( this, sprite, starting_position );

        this.health = 100 * difficulty_modifier;
    }
    Enemy.prototype = new Entity();
	Enemy.prototype.applyDamage = function() {
		var enemy_index = enemies.indexOf( this );

		if ( enemy_index < 0 ) {
			// This enemy has already died
			return;
		}

		this.health -= bullet_damage;

		// Does this kill the enemy?
		if ( this.health <= 0 ) {
			// Yep, dead

			// Remove from the enemies array
			enemies.splice(
				enemy_index,
				1
			);

			// Give gold and score
			score += 10 * difficulty_modifier; // Score increases with difficulty
			gold += 5 * difficulty_modifier;

			// Create explosion
			explosions.push( new Explosion( this.position ) );
		}
	};

	function Tower( sprite, position ) {
		Entity.call( this, sprite, position );

		this.charge = 100; // Tower can only fire when its charge is 100
		this.target = null; // Active lock on an enemy
	}
	Tower.prototype = new Entity();

	function Bullet( tower, enemy ) {
		Entity.call( this, null, new Vector( tower.position.x, tower.position.y ) );

		this.target = enemy; // Active lock on an enemy
	}
	Bullet.prototype = new Entity();

	function Explosion( position ) {
		Entity.call(
			this,
			new Sprite( spritesheets.explosion ),
			position
		);
	}
	Explosion.prototype = new Entity();

    var canvas, // Canvas element
        ctx, // 2D canvas context

		game_over = false, // Set to `true` when game ends
		animation_request, // Result of the most recent requestAnimationFrame
        last_render_time = null,// Time of last frame render, used to calculate the delta between renders

        map = [ // representation of the game map, 0 is field and 1 is road
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0,
            0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0,
            0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0,
            0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0,
            0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1,
            0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0,
            0, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0,
            0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
        ],
        map_size = 12, // number of map tiles along each dimension
        tile_size = Math.floor( 500 / map_size ), // width and height of each tile
        start_tile = [ 1, 11 ], // the tile enemies enter the map at

        map_path = {}, // Will contain a map of tile->next tile coordinates

        spritesheets = {}, // Collection of the sprite sheets

        enemies = [], // Array of all enemies on the map
        enemy_speed = 20, // How many pixels an enemy will move per second
        enemy_spawn = 3000, // How many milliseconds between enemies spawning

        towers = [], // Array of all the towers
        tower_range = 150, // How far a tower can shoot
        tower_cost = 50, // How much a tower costs
        tower_recharge = 100, // How much charge a tower recharges per second

		bullets = [], // Array of all the live bullets
		bullet_speed = 120, // How far a bullet travels per second
		bullet_hit_radius = 20, // Distance from target to be considered a hit
		bullet_damage = 20, // How much health each bullet takes away

		explosions = [], // Array of all active explosions

        score = 0, // Player's score
        gold = 200, // Player's gold

		difficulty_modifier = 1, // Higher modifier means more difficulty
		modifier_increase = 0.03; // How much to add to the modifier every second

    function findRoute() {
        var current_tile = [
                start_tile[0],
                start_tile[1]
            ],
            current_index = start_tile[1] * map_size + start_tile[0],

            other_tile = [],
            next_index;

        var iterations = 0;

        // Loop until we find the end of the path
        while( true ) {
            if ( iterations++ >= 100 ) break;

            // Check up
            other_tile[0] = current_tile[0];
            other_tile[1] = current_tile[1] - 1;
            if ( other_tile[1] > 0 ) {
                next_index = other_tile[1] * map_size + other_tile[0];
                if ( map[next_index] === 1 && !map_path[next_index] ) {
                    // This is the path!
                    map_path[ current_index ] = next_index;
                    current_tile[0] = other_tile[0];
                    current_tile[1] = other_tile[1];
                    current_index = next_index;
                    continue;
                }
            }

            // Check right
            other_tile[0] = current_tile[0] + 1;
            other_tile[1] = current_tile[1];
            if ( other_tile[0] < map_size ) {
                next_index = other_tile[1] * map_size + other_tile[0];
                if ( map[next_index] === 1 && !map_path[next_index] ) {
                    // This is the path!
                    map_path[ current_index ] = next_index;
                    current_tile[0] = other_tile[0];
                    current_tile[1] = other_tile[1];
                    current_index = next_index;
                    continue;
                }
            }

            // Check down
            other_tile[0] = current_tile[0];
            other_tile[1] = current_tile[1] + 1;
            if ( other_tile[1] < map_size ) {
                next_index = other_tile[1] * map_size + other_tile[0];
                if ( map[next_index] === 1 && !map_path[next_index] ) {
                    // This is the path!
                    map_path[ current_index ] = next_index;
                    current_tile[0] = other_tile[0];
                    current_tile[1] = other_tile[1];
                    current_index = next_index;
                    continue;
                }
            }

            // Check left
            other_tile[0] = current_tile[0] - 1;
            other_tile[1] = current_tile[1];
            if ( other_tile[0] > 0 ) {
                next_index = other_tile[1] * map_size + other_tile[0];
                if ( map[next_index] === 1 && !map_path[next_index] ) {
                    // This is the path!
                    map_path[ current_index ] = next_index;
                    current_tile[0] = other_tile[0];
                    current_tile[1] = other_tile[1];
                    current_index = next_index;
                    continue;
                }
            }

            break;
        }
    }

    function initCanvas() {
        canvas = document.createElement( 'CANVAS' );
        ctx = canvas.getContext( '2d' );

        canvas.height = canvas.width = 500;
        document.body.appendChild( canvas );
        canvas.addEventListener( 'click', handleClick );

        ctx.strokeStyle = 'rgba( 0, 0, 0, .3 )';
        ctx.font = '24px Arial';
        ctx.textAlign = 'right';
    }

    function initSpriteSheets() {
        // new SpriteSheet( path, frame_size, frame_count, animation_speed );
        spritesheets.enemy = new SpriteSheet( 'images/enemy.png', 100, 3, 0.01 );
		spritesheets.tower = new SpriteSheet( 'images/tower.png', 100, 1, 0 );
		spritesheets.explosion = new SpriteSheet( 'images/explosion.png', 100, 6, 0.01 );
    }

    function spawnEnemy() {
        enemies.push( new Enemy() );
        setTimeout(
            spawnEnemy,
            enemy_spawn * ( 1 / difficulty_modifier )
        );
    }

    function drawGround() {
        var x, y, tile_index;

        // Clear the canvas
        ctx.clearRect( 0, 0, canvas.width, canvas.height );

        for ( x = 0; x < map_size; x++ ) {
            for ( y = 0; y < map_size; y++ ) {
                tile_index = y * map_size + x;

                if ( map[tile_index] === 1 ) {
                    // Road
                    ctx.fillStyle = 'rgb( 70, 70, 80 )';
                } else {
                    // Ground
                    ctx.fillStyle = 'rgb( 15, 100, 15 )';
                }
                ctx.fillRect( x * tile_size, y * tile_size, tile_size, tile_size );
                ctx.strokeRect( x * tile_size, y * tile_size, tile_size, tile_size );
            }
        }
    }

    function drawEntity( entity, delta ) {
        var sprite = entity.sprite,
            where = entity.position;

        // Update sprite's animation
        if ( sprite.sheet.animation_speed > 0 ) {
            // Increment the current frame
            sprite.current_frame += sprite.sheet.animation_speed * delta;

            // If we have passed the last frome in the animation then start it again
            if ( sprite.current_frame > sprite.sheet.frame_count ) {
                sprite.current_frame -= sprite.sheet.frame_count;
            }
        }

        // Draw sprite
        ctx.drawImage(
            // Image
            sprite.sheet.image,

            // What part of the sprite to draw
            Math.floor( sprite.current_frame ) * sprite.sheet.frame_size, // Frame
            entity.orientation * sprite.sheet.frame_size, // Orientation
            sprite.sheet.frame_size,
            sprite.sheet.frame_size,

            // Where to draw
            where.x - tile_size / 2,
            where.y - tile_size / 2,
            tile_size,
            tile_size
        );
    }

    function findNextTile( current_tile ) {
        var current_index = current_tile[1] * map_size + current_tile[0],
            next_index = map_path[current_index];

        if ( !next_index ) {
            // End of the path
            return null;
        } else {
            return [
                next_index % map_size,
                Math.floor( next_index / map_size )
            ];
        }
    }

    function moveEnemy( enemy, delta ) {
        // When an enemy passes the middle of a tile, find where it is going next
        var position_on_tile = [
                ( enemy.position.x / tile_size ) % 1,
                ( enemy.position.y / tile_size ) % 1
            ],
            current_tile = [
                Math.floor( enemy.position.x / tile_size ),
                Math.floor( enemy.position.y / tile_size )
            ],
            check_orientation = false,
            next_tile,
            new_orientation;

        // `enemy_speed` is how many pixels per second, delta is in milliseconds
        if ( enemy.orientation === 0 ) {
            // Up
            enemy.position.y -= enemy_speed * delta / 1000;
            //console.debug( position_on_tile[1] );
            if ( position_on_tile[1] < 0.5 ) check_orientation = true;

        } else if ( enemy.orientation === 3 ) {
            // Down
            enemy.position.y += enemy_speed * delta / 1000;
            if ( position_on_tile[1] > 0.5 ) check_orientation = true;

        } else if ( enemy.orientation === 2 ) {
            // Left
            enemy.position.x -= enemy_speed * delta / 1000;
            if ( position_on_tile[0] < 0.5 ) check_orientation = true;

        } else if ( enemy.orientation === 1 ) {
            // Right
            enemy.position.x += enemy_speed * delta / 1000;
            if ( position_on_tile[0] > 0.5 ) check_orientation = true;

        }

        // If this enemy is more than halfway into the next tile (centered in it) then check for reorientation
        if ( !check_orientation ) return;

        next_tile = findNextTile( current_tile );

        if ( next_tile === null ) {
            game_over = true;
			return;
        }

        // Find the new orientation
        if ( next_tile[0] > current_tile[0] ) {
            new_orientation = 1; // right
        } else if ( next_tile[0] < current_tile[0] ) {
            new_orientation = 2; // left
        } else if ( next_tile[1] > current_tile[1] ) {
            new_orientation = 3; // down
        } else if ( next_tile[1] < current_tile[1] ) {
            new_orientation = 0; // up
        }

        if ( new_orientation !== enemy.orientation ) {
            // Force enemy to center of path and change orientation
            enemy.position.x = ( current_tile[0] * tile_size ) + ( tile_size / 2 );
            enemy.position.y = ( current_tile[1] * tile_size ) + ( tile_size / 2 );

            enemy.orientation = new_orientation;
        }
    }

    function drawEnemies( delta ) {
        var i, enemy;
        for ( i = 0; i < enemies.length; i++ ) {
            enemy = enemies[i];
            moveEnemy( enemy, delta );
            drawEntity( enemy, delta );
        }
    }

    function fireTower( tower, enemy ) {
		tower.target = enemy;
        tower.charge = 0;

		// Determine tower orientation
        var angle = Math.atan2(
				enemy.position.y - tower.position.y,
				enemy.position.x - tower.position.x
			),
			degrees = ( 360 / ( 2 * Math.PI ) ) * ( angle + Math.PI ) + 45,
			octant;

		if ( degrees > 360 ) {
			degrees -= 360;
		}

		octant = Math.floor( degrees / 361 * 8 );

		if ( octant === 0 ) {
			tower.orientation = 2; // left

		} else if ( octant === 1 ) {
			tower.orientation = 5; // top-left

		} else if ( octant === 2 ) {
			tower.orientation = 0; // top

		} else if ( octant === 3 ) {
			tower.orientation = 4; // top-right

		} else if ( octant === 4 ) {
			tower.orientation = 1; // right

		} else if ( octant === 5 ) {
			tower.orientation = 7; // bottom-right

		} else if ( octant === 6 ) {
			tower.orientation = 3; // bottom

		} else if ( octant === 7 ) {
			tower.orientation = 6; // bottom-left

		}

		// Create bullet
		bullets.push( new Bullet( tower, enemy ) );
    }

    function updateTower( tower, delta ) {
        var recharge,
            i,
            distance,
            closest_distance = Infinity,
            closest_enemy;

        // Rechange this tower up to 100 charge
        recharge = tower_recharge * delta / 1000;
        tower.charge = Math.min( tower.charge + recharge, 100 );

        if ( tower.charge < 100 ) {
            // We can't fire at anything, don't bother going further
            return;
        }

		// Does the tower already have a target, and is that target in range?
		if (
			tower.target !== null &&
			tower.target.health > 0 &&
			tower.target.position.distanceTo( tower.position ) <= tower_range
		) {

			closest_enemy = tower.target;

		} else {

			// Find the closest enemy
			for ( i = 0; i < enemies.length; i++ ) {
				distance = enemies[i].position.distanceTo( tower.position );

				if ( distance <= tower_range ) {
					// This enemy is in range, is it the closest we've found?
					if ( distance < closest_distance ) {
						// It is the closest
						closest_enemy = enemies[i];
						closest_distance = distance;
					}
				}
			}

		}

        if ( closest_enemy !== undefined ) {
            // Something is in range, fire!
            fireTower( tower, closest_enemy );
        }
    }

    function drawTowers( delta ) {
        var i, tower;
        for ( i = 0; i < towers.length; i++ ) {
            tower = towers[i];
            updateTower( tower, delta );
            drawEntity( tower, delta );
        }
    }

	function drawBullets( delta ) {
		var i,
			bullet,
			position_change = new Vector( 0, 0 );

		ctx.fillStyle = '#111';

		for ( i = 0; i < bullets.length; i++ ) {
			bullet = bullets[i];

			position_change.set(
				bullet.target.position.x - bullet.position.x,
				bullet.target.position.y - bullet.position.y
			);
			position_change.normalize();

			bullet.position.x += position_change.x * bullet_speed * delta / 1000;
			bullet.position.y += position_change.y * bullet_speed * delta / 1000;

			// Check for hit
			if ( bullet.position.distanceTo( bullet.target.position ) <= bullet_hit_radius ) {
				// It's a hit!
				bullet.target.applyDamage();

				// Remove this bullet from the array
				bullets.splice( i, 1 );

				// Decrement `i` so the for loop continues with the correct bullet
				i--;
				continue;
			}

			ctx.beginPath();
			ctx.arc(
				bullet.position.x,
				bullet.position.y,
				2, // radius
				0,
				Math.PI * 2,
				false
			);
			ctx.fill();
		}
	}

	function drawExplosions( delta ) {
		var i,
			explosion;

		for ( i = 0; i < explosions.length; i++ ) {
			explosion = explosions[i];
			drawEntity( explosion, delta );
			if ( explosion.sprite.current_frame > 5 ) {
				// Animation is done, remove this explosion
				explosions.splice( i, 1 );
				i--;
			}
		}
	}

    function drawHud() {
        ctx.fillStyle = '#000';
        ctx.fillText( 'score ' + Math.floor( score ), canvas.width - 20, 30 );

		ctx.fillStyle = '#dddd88';
		ctx.fillText( '\u00A7' + Math.floor( gold ), canvas.width - 20, 60 );
    }

    function render() {
		animation_request = requestAnimationFrame( render );

        var delta, // How many milliseconds have gone by since the last render
            now = Date.now(); // The current time

        if ( last_render_time === null ) {
            delta = 0;
        } else {
            delta = now - last_render_time;

            // Cap the delta to 30 milliseconds; this could happen for a number of reasons, but it
            // probably happened because the user switched to a different browser tab
            delta = Math.min( delta, 30 );
        }

		// Increase difficulty
		difficulty_modifier += modifier_increase * delta / 1000;
		enemy_speed += difficulty_modifier * 0.01;

		drawGround();
        drawEnemies( delta );
        drawTowers( delta );
		drawBullets( delta );
		drawExplosions( delta );
        drawHud();

		if ( game_over ) {
			// This enemy is off the board!
			cancelAnimationFrame( animation_request );

			// Draw end screen
			ctx.fillStyle = '#000';
			ctx.fillRect( 0, 0, canvas.width, canvas.height );

			ctx.fillStyle = '#fff';
			ctx.textAlign = 'center';
			ctx.font = '32px Arial';
			ctx.fillText( 'You Lost', canvas.width / 2, canvas.height / 2 );
			ctx.font = '26px Arial';
			ctx.fillText( 'score ' + Math.round( score ), canvas.width / 2, canvas.height / 2 + 50 );
		}

        last_render_time = now;
    }

    function handleClick( evt ) {
        var tile = [
                Math.floor( evt.layerX / tile_size ),
                Math.floor( evt.layerY / tile_size )
            ],
            tile_index = tile[1] * map_size + tile[0],

            position,
            sprite;

        if ( map[tile_index] === 0 && gold >= tower_cost ) {
            // Build a tower!
            gold -= tower_cost;
            map[tile_index] = 2;

            position = new Vector(
                ( tile[0] + 1 ) * tile_size - ( tile_size / 2 ), // Center of the tile horizontally
                ( tile[1] + 1 ) * tile_size - ( tile_size / 2 ) // Center of the tile vertically
            );
            sprite = new Sprite( spritesheets.tower );

            towers.push( new Tower( sprite, position ) );
        }
    }

    function start() {
        spawnEnemy();
        render();
    }

    findRoute(); // Calculate the path enemies will take
    initCanvas(); // Initialize the canvas and its context
    initSpriteSheets(); // Load the beautiful sprite sheets
    start(); // Start the game
})();