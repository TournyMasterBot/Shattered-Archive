import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class PossessFamiliar implements IAbility {
  private static instance: PossessFamiliar;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `POSSESS FAMILIAR
POSSESS FAMILIAR

Syntax: cast 'possess familiar' cat
        cast 'possess familiar' raven
        incorporate

This spell allows a witch or a warlock to take control of their pet,
inhabiting its body and seeing through its eyes.  While possessing a
familiar the caster is free to roam, but must take care that their actual
body not be damaged while left unattended.  

Naturally, the witch or warlock must have a familiar already for this spell
to work.  

See also - WITCHCRAFT`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (PossessFamiliar.instance === undefined) {
      PossessFamiliar.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): PossessFamiliar {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PossessFamiliar.GetInstance() as T;
  }
}

export default PossessFamiliar;
