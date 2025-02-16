import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Alchemy implements IAbility {
  private static instance: Alchemy;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Alchemy";
    this.helpFile = `ALCHEMY

The alchemist attempts to change one thing to another, and when applied
to magical potions, he is able to modify the very tendrils of magic emanating
from the potion, to suit his own ends.  Of course, the alchemist must be
quite familiar with the spell he wishes to place upon a potion, and some
spells are simply incapable of having such a feat performed upon them.  
When one wishes to change a potion to another, they must hold the initial
potion to be changed.  The more potent the original potion, the more potent
the resulting one.

Syntax: Alchemy <spellname>`;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Alchemy.instance === undefined) {
      Alchemy.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Alchemy {
    if (!Alchemy.instance) {
      Alchemy.instance = new Alchemy();
    }
    return Alchemy.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Alchemy.GetInstance() as T;
  }
}

export default Alchemy;
