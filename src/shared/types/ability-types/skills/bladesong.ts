import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Bladesong implements IAbility {
  private static instance: Bladesong;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Bladesong";
    this.helpFile = `BLADESONG
The Bladesong grants an elf extra hitting potential, greater damage on
successful hits, and occasionally an extra attack in a single combat round. 
Because of the quick movements required while using the Bladesong, the
Bladesinger cannot wear a shield while performing it.  The Bladesong cannot
be performed with any weapons but swords and daggers.  Also, if a
Bladesinger is disarmed, he must adapt to hand to hand combat, and re-start
his Bladesong after re-equipping himself with a new sword.  
Skilled Bladesingers have been known to dodge and sometimes parry better
while using the Bladesong, and those who have fought against an elf who uses
the Bladesong have claimed that a Bladesinger can disarm a weapon in a
manner that sends it flying through the air, and amazingly into the elf's
hands.  This rumor has not been substantiated.`;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Bladesong.instance === undefined) {
      Bladesong.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Bladesong {
    if (!Bladesong.instance) {
      Bladesong.instance = new Bladesong();
    }
    return Bladesong.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Bladesong.GetInstance() as T;
  }
}

export default Bladesong;
