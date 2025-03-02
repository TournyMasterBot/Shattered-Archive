import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class InstantRegeneration implements IAbility {
  private static instance: InstantRegeneration;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `INSTANT REGENERATION

Syntax: cast 'instant regeneration'

The battlemages most basic form of self-healing, casting this spell allows
for some life regeneration over a short time.  It can only be cast once and
awhile.  
 
Groups containing this spell: Battlemagic
 
 
SEE ALSO:  BATTLEMAGE, BATTLEMAGIC
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (InstantRegeneration.instance === undefined) {
      InstantRegeneration.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): InstantRegeneration {
    if (!InstantRegeneration.instance) {
      InstantRegeneration.instance = new InstantRegeneration();
    }
    return InstantRegeneration.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return InstantRegeneration.GetInstance() as T;
  }
}

export default InstantRegeneration;
