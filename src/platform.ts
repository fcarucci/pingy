import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { PingyPlatformAccessory } from './platformAccessory';
import { PingyPlatformAggregateAccessory } from './platformAccessory';

export class PingyPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    const targets = this.config.targets || [];

    const registeredAccessories = new Set();
    const pingAccessories = new Set<PingyPlatformAccessory>();

    for (const device of targets) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.target);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        registeredAccessories.add(existingAccessory);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        pingAccessories.add(new PingyPlatformAccessory(this, existingAccessory, device.target, device.interval));
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.target);

        const accessory = new this.api.platformAccessory(device.target, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        pingAccessories.add(new PingyPlatformAccessory(this, accessory, device.target, device.interval));

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    for (const accessory of this.accessories) {
      if (!registeredAccessories.has(accessory)) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
      }
    }

    const aggregate_uuid = this.api.hap.uuid.generate('PingsAggregate');

    let aggregateAccessory = this.accessories.find(accessory => accessory.UUID === aggregate_uuid);

    if (aggregateAccessory) {
      if (this.config.aggregate) {
        this.log.info('Restoring existing accessory from cache:', aggregateAccessory.displayName);
      } else {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [aggregateAccessory]);
        aggregateAccessory = undefined;
      }
    } else {
      if (this.config.aggregate) {
        this.log.info('Adding new aggregate accessory:', this.config.aggregate_name);
        aggregateAccessory = new this.api.platformAccessory(this.config.aggregate_name, aggregate_uuid);
        aggregateAccessory.context.device = this.config.aggregate_nameaggregate_name;
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [aggregateAccessory]);
      } else {
        aggregateAccessory = undefined;
      }
    }

    if (aggregateAccessory !== undefined) {
      PingyPlatformAccessory.setAggregateAccessory(new PingyPlatformAggregateAccessory(this, aggregateAccessory, pingAccessories));
    }
  }
}
