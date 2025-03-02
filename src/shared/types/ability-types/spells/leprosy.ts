import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Leprosy implements IAbility {
  private static instance: Leprosy;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help Leprosy
leprosy
LEPROSY

Syntax: cast 'leprosy' <target>

The shaman may opt to inflict an enemy with the loathsome disease of
leprosy, which causes the skin of the victim to begin to rot. The afflicted
will also be weakened as the flesh-eating bacteria begins to break down his
or her muscle tissue.  

Groups containing this spell: Voodoo
 
SEE ALSO: SHAMAN, VOODOO
        `;
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (Leprosy.instance === undefined) {
      Leprosy.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Leprosy {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Leprosy.GetInstance() as T;
  }
}

export default Leprosy;
