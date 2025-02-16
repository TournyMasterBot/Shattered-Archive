import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Permancy implements IAbility {
  private static instance: Permancy;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Permancy";
    this.helpFile = `PERMANENCY

Syntax: cast 'permanency' <object>

This spell allows the transmuter to infuse his essence into the object,
making any temporary effects permanent. Unfortunately, the exertion is
extremely draining to the caster, and requires a great deal of time for rest
and regeneration before the spell may be cast again.

See also - ALTERATION TRANSMUTER`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Permancy.instance === undefined) {
      Permancy.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Permancy {
    if (!Permancy.instance) {
      Permancy.instance = new Permancy();
    }
    return Permancy.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Permancy.GetInstance() as T;
  }
}

export default Permancy;
