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
import ServerCache from "@shared/cache/server-cache";

export class CharlatanDefault implements IAbilityGroup {
  static instance: CharlatanDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.CharlatanDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      DirtKicking.GetInstance(),
      Sneak.GetInstance(),
      Lore.GetInstance(),
      Swindle.GetInstance(),
      Instigate.GetInstance(),
      DangerSense.GetInstance(),
      Dodge.GetInstance(),
      Trip.GetInstance(),
      Hide.GetInstance(),
      Rack.GetInstance(),
      Turncoat.GetInstance(),
      Pretend.GetInstance(),
      Parry.GetInstance(),
      Peek.GetInstance(),
      Fake.GetInstance(),
      Sap.GetInstance(),
      EyeGouge.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): CharlatanDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CharlatanDefault.GetInstance() as T;
  }
}

export default CharlatanDefault;
