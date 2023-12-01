# Generated by Django 3.2.20 on 2023-11-15 12:06

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user_management', '0017_alter_organization_maintenance_author'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='alert_group_table_columns',
            field=models.JSONField(default=None, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='alert_group_table_selected_columns',
            field=models.JSONField(default=None, null=True),
        ),
    ]