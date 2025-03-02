import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Distortion implements IAbility {
  private static instance: Distortion;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
DISTORTION

Casting this spell, the Mentalist will distort the vision of their enemy,
causing a massively difficult time for their enemy. It is rumored that some
lose their eyesight intermittently and that it can potentially be very
difficult to cure.

Syntax: cast 'distortion' <target>
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Distortion.instance === undefined) {
      Distortion.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Distortion {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Distortion.GetInstance() as T;
  }
}

export default Distortion;
