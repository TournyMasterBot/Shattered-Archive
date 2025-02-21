import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import DangerSense from "@shared/types/ability-types/skills/danger-sense";
import DirtKicking from "@shared/types/ability-types/skills/dirt-kicking";
import Dodge from "@shared/types/ability-types/skills/dodge";
import EyeGouge from "@shared/types/ability-types/skills/eye-gouge";
import Fake from "@shared/types/ability-types/skills/fake";
import Hide from "@shared/types/ability-types/skills/hide";
import Instigate from "@shared/types/ability-types/skills/instigate";
import Lore from "@shared/types/ability-types/skills/lore";
import Parry from "@shared/types/ability-types/skills/parry";
import Peek from "@shared/types/ability-types/skills/peek";
import Pretend from "@shared/types/ability-types/skills/pretend";
import Rack from "@shared/types/ability-types/skills/rack";
import Sap from "@shared/types/ability-types/skills/sap";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Swindle from "@shared/types/ability-types/skills/swindle";
import Trip from "@shared/types/ability-types/skills/trip";
import Turncoat from "@shared/types/ability-types/skills/turncoat";

export class CharlatanDefault implements IAbilityGroup {
  static instance: CharlatanDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.CharlatanDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      new DirtKicking(),
      new Sneak(),
      new Lore(),
      new Swindle(),
      new Instigate(),
      new DangerSense(),
      new Dodge(),
      new Trip(),
      new Hide(),
      new Rack(),
      new Turncoat(),
      new Pretend(),
      new Parry(),
      new Peek(),
      new Fake(),
      new Sap(),
      new EyeGouge(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): CharlatanDefault {
    if (!CharlatanDefault.instance) {
      CharlatanDefault.instance = new CharlatanDefault();
    }
    return CharlatanDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CharlatanDefault.GetInstance() as T;
  }
}

export default CharlatanDefault;
