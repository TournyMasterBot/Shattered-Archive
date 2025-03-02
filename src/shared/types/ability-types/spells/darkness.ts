import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Darkness implements IAbility {
  private static instance: Darkness;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
DARKNESS

Syntax: cast 'darkness'

Casting darkness in a room plunges everybody in that room into a sphere of
darkness. The sphere will stay with the people in the room for a limited
time, even if they go their separate ways.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Darkness.instance === undefined) {
      Darkness.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Darkness {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Darkness.GetInstance() as T;
  }
}

export default Darkness;
