import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Devotion implements IAbility {
  private static instance: Devotion;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
DEVOTION

By showing your devotion to your deity, you vow to fight to the death. By
sacrificing your ability to flee from combat, the crusader is granted a
significant increase to their fighting capabilities. Devotion is part of
the Worship spellgroup and is only accessible to the Crusader class.  

cast 'devotion'

Please note this cannot be cast upon others.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Devotion.instance === undefined) {
      Devotion.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Devotion {
    if (!Devotion.instance) {
      Devotion.instance = new Devotion();
    }
    return Devotion.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Devotion.GetInstance() as T;
  }
}

export default Devotion;
