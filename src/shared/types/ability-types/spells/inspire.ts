import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Inspire implements IAbility {
  private static instance: Inspire;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Inspire";
    this.helpFile = `INSPIRE

Motivated by fanatical loyalty towards one's deity, the crusader is capable
of inspiring great zeal among grouped allies, empowering them with greater
protection and combat prowess.  Inspire is part of the Worship spellgroup
and is only accessible to the Crusader class.  
 
cast 'inspire'`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Inspire.instance === undefined) {
      Inspire.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Inspire {
    if (!Inspire.instance) {
      Inspire.instance = new Inspire();
    }
    return Inspire.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Inspire.GetInstance() as T;
  }
}

export default Inspire;
