import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonEmpyrealWarhorse implements IAbility {
  private static instance: SummonEmpyrealWarhorse;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `SUMMON EMPYREAL

Syntax: cast 'summon empyreal'

LORE::

Born of the immaculate powers of the Aurora, the empyreal warhorse answers
the call of the Light's chosen, galloping into battle in service of a
paladin true.  Mightier even than the gods-given white warhorse, these
miraculous beasts serve as mounts for the holy warriors and are a resilient
ally and dangerous foe for enemies of Good.

SEE ALSO:  CSR, HOLY, KNIGHTHOOD, RECLASS, PALADIN

Created: 12.  03.  2023`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SummonEmpyrealWarhorse.instance === undefined) {
      SummonEmpyrealWarhorse.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonEmpyrealWarhorse {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonEmpyrealWarhorse.GetInstance() as T;
  }
}

export default SummonEmpyrealWarhorse;
